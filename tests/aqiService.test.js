import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isTokenExpired, getTokenExpirationInfo, maskToken } from "../src/utils/jwt.js";
import {
  calculateDistance,
  fetchAQIBySlug,
  fetchAQITrend,
  searchAQILocations
} from "../src/services/aqiService.js";

function makeJwt(expSeconds) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds, userID: 1 })).toString("base64url");
  return `${header}.${payload}.signature`;
}

describe("AQI Service & Security Token Engine", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("isTokenExpired", () => {
    it("returns false for tokens with a future expiration timestamp", () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600 * 24;
      const token = makeJwt(futureExp);
      assert.equal(isTokenExpired(token), false);
    });

    it("returns true for expired tokens", () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      const token = makeJwt(pastExp);
      assert.equal(isTokenExpired(token), true);
    });

    it("proactively treats tokens expiring within the 60-second buffer as expired", () => {
      const nearExp = Math.floor(Date.now() / 1000) + 30;
      const token = makeJwt(nearExp);
      assert.equal(isTokenExpired(token), true);
    });

    it("safely marks null, undefined, and malformed strings as expired", () => {
      assert.equal(isTokenExpired(null), true);
      assert.equal(isTokenExpired(undefined), true);
      assert.equal(isTokenExpired(""), true);
      assert.equal(isTokenExpired("not.a.valid.jwt"), true);
      assert.equal(isTokenExpired("just-one-segment"), true);
    });
  });

  describe("getTokenExpirationInfo & maskToken", () => {
    it("extracts expiration and calculates remaining days for valid tokens", () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600 * 24 * 5;
      const token = makeJwt(futureExp);
      const info = getTokenExpirationInfo(token);

      assert.ok(info);
      assert.equal(info.exp, futureExp);
      assert.equal(info.isExpired, false);
      assert.equal(info.remainingDays, 5);
      assert.ok(maskToken(token).includes("..."));
    });

    it("returns null for non-token inputs", () => {
      assert.equal(getTokenExpirationInfo(null), null);
      assert.equal(getTokenExpirationInfo("malformed"), null);
      assert.equal(maskToken(null), null);
    });
  });

  describe("calculateDistance (Haversine Formula)", () => {
    it("accurately computes distance between coordinates in km", () => {
      const dist = calculateDistance(28.6139, 77.2090, 19.0760, 72.8777);
      assert.ok(dist.endsWith("km"));
      const num = parseFloat(dist);
      assert.ok(num > 1100 && num < 1200, `Expected ~1150 km, got ${dist}`);
    });

    it("formats short neighborhood distances under 1 km in meters", () => {
      const dist = calculateDistance(28.6139, 77.2090, 28.6160, 77.2100);
      assert.ok(dist.endsWith("m"));
    });

    it("returns 0 m for identical coordinates including 0,0", () => {
      assert.equal(calculateDistance(28.6139, 77.2090, 28.6139, 77.2090), "0 m");
      assert.equal(calculateDistance(0, 0, 0, 0), "0 m");
    });

    it("handles antipodal points without NaN and rejects invalid inputs", () => {
      const antipodal = calculateDistance(0, 0, 0, 180);
      assert.ok(antipodal.endsWith("km"));
      assert.equal(calculateDistance("abc", 77.2090, 28.6139, 77.2090), null);
      assert.equal(calculateDistance(null, 77.2090, 28.6139, 77.2090), null);
      assert.equal(calculateDistance(28.6139, null, 28.6139, 77.2090), null);
    });
  });

  describe("Proxy client fetch behavior", () => {
    it("routes telemetry requests through /api/aqi proxy without client tokens", async () => {
      let calledUrl = "";
      let calledHeaders = {};
      globalThis.fetch = async (url, init) => {
        calledUrl = url;
        calledHeaders = init?.headers || {};
        return new Response(
          JSON.stringify({ status: "success", data: [{ city: "Delhi", aqi: 120 }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const data = await fetchAQIBySlug("india/delhi/new-delhi");
      assert.equal(data.city, "Delhi");
      assert.ok(calledUrl.includes("/api/aqi?endpoint=%2Faqi%2Fv2%2FgetLocationDetailsBySlug"));
      assert.equal(calledHeaders.Authorization, undefined);
    });

    it("throws user-safe message on 401 without mentioning .env.local", async () => {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: "Expired" }), { status: 401 });

      await assert.rejects(
        () => fetchAQIBySlug("india/delhi/new-delhi"),
        (err) => {
          assert.match(err.message, /temporarily unavailable/i);
          assert.ok(!err.message.includes(".env.local"));
          return true;
        }
      );
    });

    it("propagates external AbortSignal cancellation on searchAQILocations", async () => {
      const controller = new AbortController();
      globalThis.fetch = async (_url, init) => {
        assert.ok(init.signal);
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      };

      await assert.rejects(() => searchAQILocations("delhi", controller.signal), {
        name: "AbortError"
      });
    });

    it("maps 24h, 7d, and 30d history requests to the matching upstream endpoints", async () => {
      const requestedEndpoints = [];
      globalThis.fetch = async (url) => {
        const parsed = new URL(String(url), "http://localhost");
        requestedEndpoints.push(parsed.searchParams.get("endpoint"));
        return new Response(
          JSON.stringify({
            status: "success",
            data: { minValue: 100, maxValue: 200, avgValue: 150, averageArray: [150], timeArray: ["2026-11-24T00:00:00.000Z"] }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const res24 = await fetchAQITrend("india/delhi/new-delhi", "24h");
      const res7 = await fetchAQITrend("india/delhi/new-delhi", "7d");
      const res30 = await fetchAQITrend("india/delhi/new-delhi", "30d");

      assert.equal(res24.avgValue, 150);
      assert.equal(res7.avgValue, 150);
      assert.equal(res30.avgValue, 150);
      // 30d with <14 items automatically checks parent/city fallback if 4-segment station slug
      assert.deepEqual(requestedEndpoints, [
        "/aqi/v3/getLast24HourHistory",
        "/aqi/getLast7DaysHistory",
        "/aqi/getLast30DaysHistory"
      ]);
    });

    it("falls back to parent city slug when a 4-segment station has sparse 30-day history", async () => {
      const requested = [];
      globalThis.fetch = async (url) => {
        const parsed = new URL(String(url), "http://localhost");
        const slug = parsed.searchParams.get("slug");
        requested.push(slug);
        if (slug === "india/delhi/new-delhi/new-sensor") {
          return new Response(
            JSON.stringify({
              status: "success",
              data: {
                minValue: 331,
                maxValue: 460,
                avgValue: 393,
                averageArray: [350, 380, 410, 460, 340, 370, 331],
                timeArray: Array(7).fill("2026-11-24T00:00:00.000Z")
              }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            status: "success",
            data: {
              minValue: 180,
              maxValue: 460,
              avgValue: 320,
              averageArray: Array(30).fill(320),
              timeArray: Array(30).fill("2026-11-24T00:00:00.000Z")
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const res = await fetchAQITrend("india/delhi/new-delhi/new-sensor", "30d");
      assert.equal(res.averageArray.length, 30);
      assert.equal(res.isCityFallback, true);
      assert.deepEqual(requested, [
        "india/delhi/new-delhi/new-sensor",
        "india/delhi/new-delhi"
      ]);
    });
  });
});
