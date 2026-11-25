import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { MongoClient } from "mongodb";
import geoHandler from "../api/geo.js";
import tokenHandler from "../api/token.js";
import aqiHandler from "../api/aqi.js";
import { invalidateTokenCache } from "../api/_tokenStore.js";

function createMockReq({ method = "GET", url = "/", headers = {}, query, body } = {}) {
  return { method, url, headers, query, body };
}

function createMockRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    headers,
    body: undefined,
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
    },
    getHeader(k) {
      return headers[k.toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

function makeJwt(expSeconds) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds, userID: 1 })).toString("base64url");
  return `${header}.${payload}.signature`;
}

describe("Serverless API Routes (geo, token, aqi)", () => {
  const tokenFile = path.join(os.tmpdir(), `cloudcompass-test-token-${process.pid}.json`);
  const origEnv = { ...process.env };
  const origFetch = globalThis.fetch;

  beforeEach(async () => {
    delete process.env.MONGODB_URI;
    delete process.env.MONGODB_DB;
    delete globalThis.__cloudcompassMongoState;
    process.env.AQI_TOKEN_STORE_PATH = tokenFile;
    invalidateTokenCache();
    await fs.rm(tokenFile, { force: true });
  });

  afterEach(async () => {
    mock.restoreAll();
    delete globalThis.__cloudcompassMongoState;
    invalidateTokenCache();
    await fs.rm(tokenFile, { force: true });
    process.env = { ...origEnv };
    globalThis.fetch = origFetch;
  });

  describe("/api/geo", () => {
    it("sets private, no-store cache headers and parses valid edge coordinates", () => {
      const req = createMockReq({
        headers: {
          "x-vercel-ip-city": "New%20Delhi",
          "x-vercel-ip-country": "IN",
          "x-vercel-ip-latitude": "28.6139",
          "x-vercel-ip-longitude": "77.2090"
        }
      });
      const res = createMockRes();
      geoHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["cache-control"], "private, no-store");
      assert.equal(res.body.city, "New Delhi");
      assert.equal(res.body.lat, 28.6139);
      assert.equal(res.body.lon, 77.209);
    });

    it("handles malformed lat/lon headers safely without throwing", () => {
      const req = createMockReq({
        headers: {
          "x-vercel-ip-city": "%E0%A4%A",
          "x-vercel-ip-latitude": "not-a-number",
          "x-vercel-ip-longitude": "0"
        }
      });
      const res = createMockRes();
      geoHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.lat, null);
      assert.equal(res.body.lon, 0);
    });
  });

  describe("/api/token", () => {
    it("fails closed with 503 when ADMIN_SECRET is unset", async () => {
      delete process.env.ADMIN_SECRET;
      const req = createMockReq({ method: "GET", headers: { "x-admin-secret": "anything" } });
      const res = createMockRes();
      await tokenHandler(req, res);

      assert.equal(res.statusCode, 503);
      assert.equal(res.headers["cache-control"], "private, no-store");
    });

    it("rejects unauthorized requests with 401", async () => {
      process.env.ADMIN_SECRET = "super-secret-123";
      const req = createMockReq({ method: "GET", headers: { "x-admin-secret": "wrong" } });
      const res = createMockRes();
      await tokenHandler(req, res);

      assert.equal(res.statusCode, 401);
    });

    it("rejects expired or malformed JWTs on POST", async () => {
      process.env.ADMIN_SECRET = "super-secret-123";
      const expiredToken = makeJwt(Math.floor(Date.now() / 1000) - 600);
      const req = createMockReq({
        method: "POST",
        headers: { "x-admin-secret": "super-secret-123" },
        body: { token: expiredToken }
      });
      const res = createMockRes();
      await tokenHandler(req, res);

      assert.equal(res.statusCode, 400);
    });

    it("persists a valid JWT globally, returns masked metadata, and clears on DELETE", async () => {
      process.env.ADMIN_SECRET = "super-secret-123";
      const validToken = makeJwt(Math.floor(Date.now() / 1000) + 3600 * 24 * 7);

      const postRes = createMockRes();
      await tokenHandler(
        createMockReq({
          method: "POST",
          headers: { "x-admin-secret": "super-secret-123" },
          body: { token: `Bearer ${validToken}` }
        }),
        postRes
      );
      assert.equal(postRes.statusCode, 200);
      assert.equal(postRes.body.configured, true);
      assert.equal(postRes.body.isExpired, false);
      assert.ok(postRes.body.tokenPreview.includes("..."));
      assert.ok(!JSON.stringify(postRes.body).includes(validToken));

      const delRes = createMockRes();
      await tokenHandler(
        createMockReq({
          method: "DELETE",
          headers: { "x-admin-secret": "super-secret-123" }
        }),
        delRes
      );
      assert.equal(delRes.statusCode, 200);
      assert.equal(delRes.body.configured, false);
    });

    it("persists and reads global tokens via MongoDB Atlas when MONGODB_URI is configured (including pasted prefix/quotes)", async () => {
      process.env.ADMIN_SECRET = "super-secret-123";
      process.env.MONGODB_URI = 'MONGODB_URI="mongodb://localhost:27017/cloudcompass-test"';
      const validToken = makeJwt(Math.floor(Date.now() / 1000) + 3600 * 24 * 7);

      const docs = new Map();
      let capturedDbName = "";
      let capturedCollection = "";

      mock.method(MongoClient.prototype, "connect", async function () {
        return this;
      });
      mock.method(MongoClient.prototype, "db", function (dbName) {
        capturedDbName = dbName;
        return {
          collection(colName) {
            capturedCollection = colName;
            return {
              async findOne(filter) {
                return docs.get(filter._id) || null;
              },
              async updateOne(filter, update, opts) {
                assert.equal(opts?.upsert, true);
                docs.set(filter._id, { _id: filter._id, ...update.$set });
                return { acknowledged: true };
              },
              async deleteOne(filter) {
                docs.delete(filter._id);
                return { acknowledged: true };
              }
            };
          }
        };
      });

      const postRes = createMockRes();
      await tokenHandler(
        createMockReq({
          method: "POST",
          headers: { "x-admin-secret": "super-secret-123" },
          body: { token: validToken }
        }),
        postRes
      );

      assert.equal(postRes.statusCode, 200);
      assert.equal(capturedDbName, "cloudcompass-test");
      assert.equal(capturedCollection, "app_tokens");
      assert.equal(postRes.body.storageMode, "mongodb");
      assert.equal(postRes.body.isGlobalPersistent, true);
      assert.equal(postRes.body.configured, true);

      invalidateTokenCache();
      const getRes = createMockRes();
      await tokenHandler(
        createMockReq({
          method: "GET",
          headers: { "x-admin-secret": "super-secret-123" }
        }),
        getRes
      );
      assert.equal(getRes.statusCode, 200);
      assert.equal(getRes.body.source, "mongodb");
      assert.equal(getRes.body.configured, true);

      const delRes = createMockRes();
      await tokenHandler(
        createMockReq({
          method: "DELETE",
          headers: { "x-admin-secret": "super-secret-123" }
        }),
        delRes
      );
      assert.equal(delRes.statusCode, 200);
      assert.equal(delRes.body.configured, false);
      assert.equal(docs.size, 0);
    });

    it("surfaces safe actionable error without leaking credentials when MONGODB_URI is malformed", async () => {
      process.env.ADMIN_SECRET = "super-secret-123";
      process.env.MONGODB_URI = "https://admin:supersecretpw@cluster.example.net/";
      const validToken = makeJwt(Math.floor(Date.now() / 1000) + 3600 * 24 * 7);

      const postRes = createMockRes();
      await tokenHandler(
        createMockReq({
          method: "POST",
          headers: { "x-admin-secret": "super-secret-123" },
          body: { token: validToken }
        }),
        postRes
      );

      assert.equal(postRes.statusCode, 500);
      assert.match(postRes.body.error, /Invalid MONGODB_URI format/i);
      assert.ok(!postRes.body.error.includes("supersecretpw"));
    });
  });

  describe("/api/aqi", () => {
    it("blocks disallowed SSRF endpoints with 400 and non-GET methods with 405", async () => {
      const postRes = createMockRes();
      await aqiHandler(createMockReq({ method: "POST" }), postRes);
      assert.equal(postRes.statusCode, 405);

      const ssrfRes = createMockRes();
      await aqiHandler(
        createMockReq({
          method: "GET",
          url: "/api/aqi?endpoint=https://evil.example/steal"
        }),
        ssrfRes
      );
      assert.equal(ssrfRes.statusCode, 400);
    });

    it("returns 401 when no active valid token is configured", async () => {
      delete process.env.AQI_TOKEN;
      const res = createMockRes();
      await aqiHandler(
        createMockReq({
          method: "GET",
          url: "/api/aqi?endpoint=/aqi/v2/getLocationDetailsBySlug&slug=india/delhi/new-delhi"
        }),
        res
      );
      assert.equal(res.statusCode, 401);
    });

    it("forwards valid allowlisted telemetry and 7d/30d history queries with server-side Bearer token", async () => {
      const validToken = makeJwt(Math.floor(Date.now() / 1000) + 3600 * 24);
      process.env.AQI_TOKEN = validToken;

      let upstreamAuth = "";
      let upstreamUrl = "";
      globalThis.fetch = async (url, init) => {
        upstreamUrl = url;
        upstreamAuth = init?.headers?.Authorization || "";
        return new Response(JSON.stringify({ status: "success", data: [{ city: "New Delhi" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      };

      const res = createMockRes();
      await aqiHandler(
        createMockReq({
          method: "GET",
          url: "/api/aqi?endpoint=/aqi/v2/getLocationDetailsBySlug&slug=india/delhi/new-delhi&type=3"
        }),
        res
      );

      assert.equal(res.statusCode, 200);
      assert.equal(upstreamAuth, `Bearer ${validToken}`);
      assert.ok(upstreamUrl.startsWith("https://apiserver.aqi.in/aqi/v2/getLocationDetailsBySlug"));
      assert.equal(res.body.status, "success");

      for (const histEndpoint of ["/aqi/getLast7DaysHistory", "/aqi/getLast30DaysHistory"]) {
        const histRes = createMockRes();
        await aqiHandler(
          createMockReq({
            method: "GET",
            url: `/api/aqi?endpoint=${encodeURIComponent(histEndpoint)}&slug=india/delhi/new-delhi&sensorname=AQI-IN&slugType=cityId`
          }),
          histRes
        );
        assert.equal(histRes.statusCode, 200);
        assert.ok(upstreamUrl.startsWith(`https://apiserver.aqi.in${histEndpoint}`));
      }
    });
  });
});
