import { getActiveToken, invalidateTokenCache } from "./_tokenStore.js";
import { isTokenExpired } from "../src/utils/jwt.js";

const DEFAULT_API_BASE = "https://apiserver.aqi.in";

const ALLOWED_ENDPOINTS = new Set([
  "/aqi/v2/getLocationDetailsBySlug",
  "/aqi/v2/getNearestLocation",
  "/aqi/v3/getLast24HourHistory",
  "/aqi/getLast7DaysHistory",
  "/aqi/getLast30DaysHistory",
  "/aqi/searchLocationCityStateCountry",
  "/aqi/getAirQualityRanklistCountryAndCity"
]);

const ALLOWED_PARAMS = new Set([
  "slug",
  "type",
  "lat",
  "long",
  "sensorname",
  "slugType",
  "searchString",
  "limit",
  "source"
]);

function getQueryObject(req) {
  if (req.query && typeof req.query === "object") {
    return req.query;
  }
  const parsed = new URL(req.url || "/", "http://localhost");
  return Object.fromEntries(parsed.searchParams.entries());
}

function buildUpstreamUrl(endpoint, queryObj) {
  const base = (process.env.AQI_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
  const url = new URL(`${base}${endpoint}`);

  for (const [key, rawVal] of Object.entries(queryObj)) {
    if (key === "endpoint" || !ALLOWED_PARAMS.has(key)) continue;
    const val = Array.isArray(rawVal) ? rawVal[0] : rawVal;
    if (val === undefined || val === null || val === "") continue;

    if (key === "limit") {
      const limitNum = Number(val);
      if (Number.isFinite(limitNum)) {
        url.searchParams.set("limit", String(Math.max(1, Math.min(25, Math.round(limitNum)))));
      }
      continue;
    }

    url.searchParams.set(key, String(val).slice(0, 200));
  }

  if (!url.searchParams.has("source")) {
    url.searchParams.set("source", "web");
  }
  return url;
}

async function fetchUpstream(url, token) {
  return fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(9500)
  });
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const queryObj = getQueryObject(req);
  const rawEndpoint = Array.isArray(queryObj.endpoint) ? queryObj.endpoint[0] : queryObj.endpoint;
  const endpoint = typeof rawEndpoint === "string" ? rawEndpoint.trim() : "";

  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(400).json({ error: "Unsupported or invalid telemetry endpoint." });
  }

  let token = await getActiveToken();
  if (!token || isTokenExpired(token)) {
    invalidateTokenCache();
    token = await getActiveToken();
  }

  if (!token || isTokenExpired(token)) {
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(401).json({
      status: "unauthorized",
      error: "Air quality telemetry service is awaiting token renewal."
    });
  }

  const upstreamUrl = buildUpstreamUrl(endpoint, queryObj);

  try {
    let upstreamRes = await fetchUpstream(upstreamUrl, token);

    if (upstreamRes.status === 401) {
      invalidateTokenCache();
      const refreshedToken = await getActiveToken();
      if (refreshedToken && refreshedToken !== token && !isTokenExpired(refreshedToken)) {
        upstreamRes = await fetchUpstream(upstreamUrl, refreshedToken);
      }
    }

    if (upstreamRes.status === 401) {
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(401).json({
        status: "unauthorized",
        error: "Air quality telemetry authorization has expired and needs renewal."
      });
    }

    if (upstreamRes.status === 404) {
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
      return res.status(200).json({ status: "not_found", message: "Not found", data: {} });
    }

    if (!upstreamRes.ok) {
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(502).json({
        error: `Upstream telemetry service responded with status ${upstreamRes.status}.`
      });
    }

    const payload = await upstreamRes.json();
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(payload);
  } catch (err) {
    res.setHeader("Cache-Control", "private, no-store");
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return res.status(504).json({ error: "Upstream telemetry request timed out." });
    }
    return res.status(502).json({ error: "Failed to reach upstream telemetry service." });
  }
}
