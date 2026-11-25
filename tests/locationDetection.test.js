import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getCityFromTimezone,
  getSavedLocation,
  saveLastLocation,
  detectApproximateLocation
} from "../src/services/locationDetection.js";
import { STORAGE_KEYS } from "../src/constants/api.js";

describe("Progressive Location Discovery Engine", () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  describe("getCityFromTimezone", () => {
    it("safely resolves system IANA timezone according to environment", () => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const city = getCityFromTimezone();
      if (tz && tz.includes("/")) {
        assert.equal(typeof city, "string");
        assert.ok(city.length > 1);
      } else {
        assert.equal(city, null);
      }
    });

    it("replaces underscores with spaces cleanly", () => {
      const origResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
      try {
        Intl.DateTimeFormat.prototype.resolvedOptions = () => ({
          timeZone: "America/New_York"
        });
        assert.equal(getCityFromTimezone(), "New York");

        Intl.DateTimeFormat.prototype.resolvedOptions = () => ({
          timeZone: "America/Buenos_Aires"
        });
        assert.equal(getCityFromTimezone(), "Buenos Aires");

        Intl.DateTimeFormat.prototype.resolvedOptions = () => ({
          timeZone: "Asia/Kolkata"
        });
        assert.equal(getCityFromTimezone(), "Kolkata");
      } finally {
        Intl.DateTimeFormat.prototype.resolvedOptions = origResolvedOptions;
      }
    });

    it("returns null if timezone does not contain a slash", () => {
      const origResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
      try {
        Intl.DateTimeFormat.prototype.resolvedOptions = () => ({
          timeZone: "UTC"
        });
        assert.equal(getCityFromTimezone(), null);
      } finally {
        Intl.DateTimeFormat.prototype.resolvedOptions = origResolvedOptions;
      }
    });
  });

  describe("Session Location Persistence (localStorage)", () => {
    const mockStorage = new Map();
    beforeEach(() => {
      mockStorage.clear();
      globalThis.window = {
        localStorage: {
          getItem: (key) => mockStorage.get(key) || null,
          setItem: (key, val) => mockStorage.set(key, String(val)),
          removeItem: (key) => mockStorage.delete(key)
        }
      };
    });

    it("persists and restores location payload including 0,0 coordinates", () => {
      const sampleLoc = {
        city: "Mumbai",
        country: "IN",
        lat: 19.076,
        lon: 72.8777,
        slug: "india/maharashtra/mumbai"
      };

      saveLastLocation(sampleLoc);
      assert.deepEqual(getSavedLocation(), sampleLoc);

      const zeroCoordLoc = { lat: 0, lon: 0 };
      saveLastLocation(zeroCoordLoc);
      assert.deepEqual(getSavedLocation(), zeroCoordLoc);
    });

    it("returns null when storage is empty or corrupted", () => {
      assert.equal(getSavedLocation(), null);

      globalThis.window.localStorage.setItem(STORAGE_KEYS.LAST_LOCATION, "corrupted-json{[[");
      assert.equal(getSavedLocation(), null);
    });
  });

  describe("detectApproximateLocation", () => {
    it("resolves from /api/geo when Edge IP headers are available", async () => {
      globalThis.fetch = async (url) => {
        if (String(url).includes("/api/geo")) {
          return new Response(
            JSON.stringify({ city: "Null Island", country: "XX", lat: 0, lon: 0 }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        throw new Error("unexpected network call");
      };

      const location = await detectApproximateLocation();
      assert.equal(location.source, "edge-ip");
      assert.equal(location.lat, 0);
      assert.equal(location.lon, 0);
    });

    it("falls back to timezone heuristic or static anchor when network APIs fail", async () => {
      globalThis.fetch = async () => {
        throw new Error("network unavailable");
      };

      const location = await detectApproximateLocation();
      assert.ok(location);
      assert.ok(location.city, "Resolved location must include a city name");
      assert.ok(
        ["browser-timezone", "static-fallback"].includes(location.source),
        `Unexpected source: ${location.source}`
      );
    });
  });
});
