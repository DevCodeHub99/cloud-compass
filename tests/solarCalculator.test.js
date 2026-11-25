import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateSolarCycle } from "../src/utils/solarCalculator.js";

describe("NOAA Solar Calculator Engine", () => {
  it("computes valid solar cycle events for standard coordinates (New Delhi)", () => {
    const lat = 28.6139;
    const lon = 77.2090;
    const refDate = new Date("2026-03-20T12:00:00Z");

    const result = calculateSolarCycle(lat, lon, refDate);

    assert.ok(result.sunrise, "sunrise must be defined");
    assert.ok(result.sunset, "sunset must be defined");
    assert.ok(result.solarNoon, "solarNoon must be defined");
    assert.ok(result.dawn, "dawn must be defined");
    assert.ok(result.dusk, "dusk must be defined");
    assert.match(result.sunrise, /^\d{1,2}:\d{2}\s(AM|PM)$/);
    assert.match(result.sunset, /^\d{1,2}:\d{2}\s(AM|PM)$/);
    assert.ok(result.daylightStr.includes("h"));
    assert.ok(result.nightStr.includes("h"));
  });

  it("accurately derives daytime vs nighttime status based on current time", () => {
    const lat = 28.6139;
    const lon = 77.2090;

    const dayDate = new Date("2026-03-20T06:30:00Z");
    const dayResult = calculateSolarCycle(lat, lon, dayDate);
    assert.equal(dayResult.isDay, true, "12:00 PM IST should be daytime");
    assert.ok(dayResult.dayProgress > 0 && dayResult.dayProgress < 1);

    const nightDate = new Date("2026-03-20T18:30:00Z");
    const nightResult = calculateSolarCycle(lat, lon, nightDate);
    assert.equal(nightResult.isDay, false, "12:00 AM IST should be nighttime");
  });

  it("handles Western and Far-Eastern longitudes crossing UTC midnight accurately", () => {
    // Los Angeles at 11:00 AM local (UTC-8) -> sunset falls on next UTC calendar date
    const la = calculateSolarCycle(34.0522, -118.2437, new Date("2026-03-20T19:00:00Z"));
    assert.equal(la.isDay, true, "LA 11:00 AM local must be daytime");
    assert.notEqual(la.daylightStr, "0h 00m");
    assert.ok(la.rawSunset.getTime() > la.rawSunrise.getTime());
    assert.ok(la.dayProgress > 0 && la.dayProgress < 1);
    assert.match(la.solarNoon, /(11|12):\d{2}\s(AM|PM)/);

    // Tokyo at 12:00 PM local (UTC+9) -> sunrise falls on previous UTC calendar date
    const tokyo = calculateSolarCycle(35.6762, 139.6503, new Date("2026-03-20T03:00:00Z"));
    assert.equal(tokyo.isDay, true, "Tokyo 12:00 PM local must be daytime");
    assert.notEqual(tokyo.daylightStr, "0h 00m");
    assert.ok(tokyo.rawSunset.getTime() > tokyo.rawSunrise.getTime());

    // Anchorage winter solstice at 12:00 PM local (UTC-9)
    const anchorage = calculateSolarCycle(61.2181, -149.9003, new Date("2026-12-21T21:00:00Z"));
    assert.equal(anchorage.isDay, true);
    assert.notEqual(anchorage.daylightStr, "0h 00m");
    assert.ok(anchorage.rawSunset.getTime() > anchorage.rawSunrise.getTime());
  });

  it("applies target geographic timezone offset rather than browser client time", () => {
    const lat = 28.6139;
    const lon = 77.2090;
    const refDate = new Date("2026-03-20T12:00:00Z");

    const resultIST = calculateSolarCycle(lat, lon, refDate, 330);
    const resultGMT = calculateSolarCycle(lat, lon, refDate, 0);

    assert.notEqual(resultIST.sunrise, resultGMT.sunrise);
  });

  it("handles extreme coordinates gracefully without throwing exceptions", () => {
    const northLat = 69.6492;
    const northLon = 18.9553;
    const winterDate = new Date("2026-12-21T12:00:00Z");

    assert.doesNotThrow(() => {
      const res = calculateSolarCycle(northLat, northLon, winterDate);
      assert.ok(res);
      assert.ok(res.sunrise);
      assert.ok(res.nextEvent.label);
    });

    assert.doesNotThrow(() => {
      const res = calculateSolarCycle(0, 0, new Date("2026-06-21T12:00:00Z"));
      assert.ok(res);
      assert.equal(typeof res.isDay, "boolean");
      assert.match(res.solarNoon, /12:\d{2}\sPM/);
    });
  });

  it("provides upcoming countdown event", () => {
    const res = calculateSolarCycle(28.6139, 77.2090, new Date());
    assert.ok(res.nextEvent);
    assert.ok(["sunrise", "sunset"].includes(res.nextEvent.type));
    assert.ok(res.nextEvent.countdown);
    assert.ok(res.nextEvent.label);
  });
});
