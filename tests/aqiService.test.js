import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isTokenExpired,
  getTokenExpirationInfo,
  calculateDistance
} from "../src/services/aqiService.js";

function makeJwt(expSeconds) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds, userID: 1 })).toString("base64");
  return `${header}.${payload}.signature`;
}

describe("AQI Service & Security Token Engine", () => {
  describe("isTokenExpired", () => {
    it("returns false for tokens with a future expiration timestamp", () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600 * 24; // +24 hours
      const token = makeJwt(futureExp);
      assert.equal(isTokenExpired(token), false);
    });

    it("returns true for expired tokens", () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600; // -1 hour
      const token = makeJwt(pastExp);
      assert.equal(isTokenExpired(token), true);
    });

    it("proactively treats tokens expiring within the 60-second buffer as expired", () => {
      const nearExp = Math.floor(Date.now() / 1000) + 30; // +30 seconds
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

  describe("getTokenExpirationInfo", () => {
    it("extracts expiration and calculates remaining days for valid tokens", () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600 * 24 * 5; // +5 days
      const token = makeJwt(futureExp);
      const info = getTokenExpirationInfo(token);

      assert.ok(info);
      assert.equal(info.exp, futureExp);
      assert.equal(info.isExpired, false);
      assert.equal(info.remainingDays, 5);
    });

    it("returns null for non-token inputs", () => {
      assert.equal(getTokenExpirationInfo(null), null);
      assert.equal(getTokenExpirationInfo("malformed"), null);
    });
  });

  describe("calculateDistance (Haversine Formula)", () => {
    it("accurately computes distance between coordinates in km", () => {
      // New Delhi (28.6139, 77.2090) to Mumbai (19.0760, 72.8777) ~ 1150 km
      const dist = calculateDistance(28.6139, 77.2090, 19.0760, 72.8777);
      assert.ok(dist.endsWith("km"));
      const num = parseFloat(dist);
      assert.ok(num > 1100 && num < 1200, `Expected ~1150 km, got ${dist}`);
    });

    it("formats short neighborhood distances under 1 km in meters", () => {
      // Coordinates approx 300 meters apart
      const dist = calculateDistance(28.6139, 77.2090, 28.6160, 77.2100);
      assert.ok(dist.endsWith("m"));
    });

    it("returns 0 m for identical coordinates", () => {
      const dist = calculateDistance(28.6139, 77.2090, 28.6139, 77.2090);
      assert.equal(dist, "0 m");
    });

    it("handles null or missing coordinates gracefully", () => {
      assert.equal(calculateDistance(null, 77.2090, 28.6139, 77.2090), null);
      assert.equal(calculateDistance(28.6139, null, 28.6139, 77.2090), null);
    });
  });
});
