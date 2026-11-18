import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getCityFromTimezone,
  getSavedLocation,
  saveLastLocation,
  detectApproximateLocation
} from "../src/services/locationDetection.js";
import { STORAGE_KEYS } from "../src/constants/api.js";

describe("Progressive Location Discovery Engine", () => {
  describe("getCityFromTimezone", () => {
    it("safely resolves system IANA timezone according to environment", () => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const city = getCityFromTimezone();
      if (tz && tz.includes("/")) {
        assert.equal(typeof city, "string");
        assert.ok(city.length > 1);
      } else {
        // In headless CI environments (e.g. GitHub Actions ubuntu-latest), default timezone is UTC
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
    // In Node test environment, window.localStorage is mocked via global simulation
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

    it("persists and restores location payload", () => {
      const sampleLoc = {
        city: "Mumbai",
        country: "IN",
        lat: 19.076,
        lon: 72.8777,
        slug: "india/maharashtra/mumbai"
      };

      saveLastLocation(sampleLoc);
      const restored = getSavedLocation();

      assert.deepEqual(restored, sampleLoc);
    });

    it("returns null when storage is empty or corrupted", () => {
      assert.equal(getSavedLocation(), null);

      globalThis.window.localStorage.setItem(STORAGE_KEYS.LAST_LOCATION, "corrupted-json{[[");
      assert.equal(getSavedLocation(), null);
    });
  });

  describe("detectApproximateLocation", () => {
    it("falls back to timezone heuristic or static anchor when network APIs are unreachable", async () => {
      // In sandbox mode without network access, detectApproximateLocation should resolve cleanly
      const location = await detectApproximateLocation();
      assert.ok(location);
      assert.ok(location.city, "Resolved location must include a city name");
      assert.ok(
        ["edge-ip", "client-ip", "browser-timezone", "static-fallback"].includes(location.source),
        `Unexpected source: ${location.source}`
      );
    });
  });
});
