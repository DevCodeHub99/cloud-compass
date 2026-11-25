import fs from "node:fs/promises";
import path from "node:path";
import { MongoClient, ServerApiVersion } from "mongodb";
import {
  parseJwtPayload,
  isTokenExpired,
  getTokenExpirationInfo,
  maskToken
} from "../src/utils/jwt.js";

const MONGO_DOC_ID = "aqi_token";
const DEFAULT_MONGO_DB = "cloudcompass";
const DEFAULT_MONGO_COLLECTION = "app_tokens";
const MONGO_GLOBAL_KEY = "__cloudcompassMongoState";
const CACHE_TTL_MS = 10000;

let memoryCache = {
  token: null,
  source: null,
  updatedAt: null,
  fetchedAt: 0
};

function resolveMongoDbName(uri) {
  const explicitDb = process.env.MONGODB_DB?.trim();
  if (explicitDb) return explicitDb;

  try {
    const parsed = new URL(uri);
    const pathSegment = parsed.pathname.replace(/^\/+/, "").split("/")[0];
    if (pathSegment) return decodeURIComponent(pathSegment);
  } catch {
    // Fallback for replica seedlist URIs
  }
  return DEFAULT_MONGO_DB;
}

function normalizeMongoUri(raw) {
  let uri = String(raw || "").trim();
  if (/^MONGODB_URI\s*=/i.test(uri)) {
    uri = uri.slice(uri.indexOf("=") + 1).trim();
  }
  if ((uri.startsWith("\"") && uri.endsWith("\"")) || (uri.startsWith("'") && uri.endsWith("'"))) {
    uri = uri.slice(1, -1).trim();
  }
  return uri;
}

function getMongoConfig() {
  const rawUri = process.env.MONGODB_URI;
  if (!rawUri || !rawUri.trim()) return null;

  const uri = normalizeMongoUri(rawUri);
  return {
    uri,
    dbName: resolveMongoDbName(uri),
    collectionName: process.env.MONGODB_COLLECTION?.trim() || DEFAULT_MONGO_COLLECTION
  };
}

function classifyMongoError(err) {
  const msg = String(err?.message || "");
  if (err?.name === "MongoParseError" || /Invalid scheme/i.test(msg)) {
    return "Invalid MONGODB_URI format. Ensure it is just mongodb://... or mongodb+srv://... (without duplicate MONGODB_URI= prefix or quotes).";
  }
  if (err?.code === 8000 || /bad auth|authentication failed/i.test(msg)) {
    return "MongoDB Atlas authentication failed. Check the database username and URL-encoded password in MONGODB_URI.";
  }
  if (
    err?.name === "MongoServerSelectionError" ||
    /timed out|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|querySrv/i.test(msg)
  ) {
    return "Cannot reach MongoDB Atlas. Check Atlas Network Access (allow 0.0.0.0/0 for Vercel or your current IP) and DNS connectivity.";
  }
  return `Failed to persist token to MongoDB Atlas (${err?.name || "Error"}). Verify MONGODB_URI, Atlas Network Access, and database user permissions.`;
}

function getLocalStorePath() {
  if (process.env.AQI_TOKEN_STORE_PATH) {
    return process.env.AQI_TOKEN_STORE_PATH;
  }
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
    return "/tmp/cloudcompass-aqi-token.json";
  }
  return path.join(process.cwd(), ".aqi-token.json");
}

function getStorageMode() {
  if (getMongoConfig()) return "mongodb";
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) return "tmp-memory";
  return "local-file";
}

export function invalidateTokenCache() {
  memoryCache = {
    token: null,
    source: null,
    updatedAt: null,
    fetchedAt: 0
  };
}

async function getMongoCollection() {
  const cfg = getMongoConfig();
  if (!cfg) return null;

  let cached = globalThis[MONGO_GLOBAL_KEY];
  if (!cached || cached.uri !== cfg.uri || !cached.promise) {
    const client = new MongoClient(cfg.uri, {
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 10000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 15000,
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
      }
    });

    const connectPromise = client.connect().catch((err) => {
      if (globalThis[MONGO_GLOBAL_KEY]?.promise === connectPromise) {
        delete globalThis[MONGO_GLOBAL_KEY];
      }
      throw err;
    });

    cached = { uri: cfg.uri, promise: connectPromise };
    globalThis[MONGO_GLOBAL_KEY] = cached;
  }

  const client = await cached.promise;
  return client.db(cfg.dbName).collection(cfg.collectionName);
}

async function readFromMongo() {
  const collection = await getMongoCollection();
  if (!collection) return null;

  const doc = await collection.findOne({ _id: MONGO_DOC_ID });
  if (doc && typeof doc.token === "string") {
    return {
      token: doc.token,
      updatedAt: doc.updatedAt || null,
      source: "mongodb"
    };
  }
  return null;
}

async function writeToMongo(record) {
  try {
    const cfg = getMongoConfig();
    if (!cfg) return false;
    if (!/^mongodb(\+srv)?:\/\//.test(cfg.uri)) {
      const parseErr = new Error('Invalid scheme, expected "mongodb://" or "mongodb+srv://"');
      parseErr.name = "MongoParseError";
      throw parseErr;
    }

    const collection = await getMongoCollection();
    if (!collection) return false;

    if (record) {
      await collection.updateOne(
        { _id: MONGO_DOC_ID },
        { $set: { token: record.token, updatedAt: record.updatedAt } },
        { upsert: true }
      );
    } else {
      await collection.deleteOne({ _id: MONGO_DOC_ID });
    }
    return true;
  } catch (err) {
    const wrapped = new Error(classifyMongoError(err));
    wrapped.statusCode = err?.name === "MongoParseError" ? 500 : 502;
    wrapped.cause = err;
    throw wrapped;
  }
}

async function readFromFile() {
  const filePath = getLocalStorePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === "string") {
      return {
        token: parsed.token,
        updatedAt: parsed.updatedAt || null,
        source: getStorageMode()
      };
    }
  } catch {
    // Missing or unreadable token file
  }
  return null;
}

async function writeToFile(record) {
  const filePath = getLocalStorePath();
  if (!record) {
    await fs.rm(filePath, { force: true });
    return;
  }
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), { encoding: "utf8", mode: 0o600 });
}

async function getActiveTokenRecord() {
  const now = Date.now();
  if (memoryCache.token && now - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return {
      token: memoryCache.token,
      source: memoryCache.source,
      updatedAt: memoryCache.updatedAt
    };
  }

  const mongoCfg = getMongoConfig();
  let record = null;
  let remoteReadFailed = false;

  if (mongoCfg) {
    try {
      record = await readFromMongo();
    } catch {
      remoteReadFailed = true;
      console.warn("[CloudCompass:WARN] MongoDB token store read failed; falling back to cache/env.");
    }
  } else {
    record = await readFromFile();
  }

  if (!record && remoteReadFailed && memoryCache.token) {
    record = {
      token: memoryCache.token,
      updatedAt: memoryCache.updatedAt,
      source: memoryCache.source || getStorageMode()
    };
  }

  if (!record && process.env.AQI_TOKEN) {
    record = {
      token: process.env.AQI_TOKEN.trim(),
      updatedAt: null,
      source: "env-fallback"
    };
  }

  if (record && record.token) {
    memoryCache = {
      token: record.token,
      source: record.source,
      updatedAt: record.updatedAt,
      fetchedAt: now
    };
    return record;
  }

  return { token: null, source: getStorageMode(), updatedAt: null };
}

export async function getActiveToken() {
  const record = await getActiveTokenRecord();
  return record.token;
}

/**
 * Validates and persists a new global AQI Bearer token.
 * @param {string} rawToken
 */
export async function setActiveToken(rawToken) {
  const token = typeof rawToken === "string" ? rawToken.trim().replace(/^Bearer\s+/i, "") : "";
  const payload = parseJwtPayload(token);
  if (!payload) {
    const err = new Error("Invalid JWT format. Paste a valid three-segment Bearer JWT.");
    err.statusCode = 400;
    throw err;
  }
  if (isTokenExpired(token)) {
    const err = new Error("Provided JWT token is already expired or expires within 60 seconds.");
    err.statusCode = 400;
    throw err;
  }

  const record = {
    token,
    updatedAt: new Date().toISOString()
  };

  const mongoCfg = getMongoConfig();
  if (mongoCfg) {
    await writeToMongo(record);
  } else {
    try {
      await writeToFile(record);
    } catch {
      // Non-fatal if read-only filesystem outside /tmp
    }
  }

  memoryCache = {
    token,
    source: mongoCfg ? "mongodb" : getStorageMode(),
    updatedAt: record.updatedAt,
    fetchedAt: Date.now()
  };

  return getTokenStoreStatus();
}

/**
 * Removes the runtime-persisted token override.
 */
export async function clearActiveToken() {
  if (getMongoConfig()) {
    await writeToMongo(null);
  }
  try {
    await writeToFile(null);
  } catch {
    // Non-fatal
  }
  invalidateTokenCache();
  return getTokenStoreStatus();
}

/**
 * Returns non-sensitive status metadata about the active global token.
 */
export async function getTokenStoreStatus() {
  const record = await getActiveTokenRecord();
  const storageMode = getStorageMode();
  const info = record.token ? getTokenExpirationInfo(record.token) : null;

  return {
    configured: Boolean(record.token),
    storageMode,
    isGlobalPersistent: storageMode === "mongodb" || storageMode === "local-file",
    source: record.source || storageMode,
    updatedAt: record.updatedAt,
    isExpired: record.token ? isTokenExpired(record.token) : true,
    expiresAt: info?.expiresAt || null,
    remainingDays: info?.remainingDays ?? null,
    tokenPreview: record.token ? maskToken(record.token) : null
  };
}
