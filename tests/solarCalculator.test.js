import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateSolarCycle } from "../src/utils/solarCalculator.js";

describe("NOAA Solar Calculator Engine", () => {
  it("computes valid solar cycle events for standard coordinates (New Delhi)", () => {
    // Arrange: New Delhi coordinates on equinox date (March 20, 2026)
    const lat = 28.6139;
    const lon = 77.2090;
    const refDate = new Date("2026-03-20T12:00:00Z");

    // Act
    const result = calculateSolarCycle(lat, lon, refDate);

    // Assert
    assert.ok(result.sunrise, "sunrise must be defined");
    assert.ok(result.sunset, "sunset must be defined");
    assert.ok(result.solarNoon, "solarNoon must be defined");
    assert.ok(result.dawn, "dawn must be defined");
    assert.ok(result.dusk, "dusk must be defined");
    assert.match(result.sunrise, /^\d{1,2}:\d{2}\s(AM|PM)$/, "sunrise must match standard time format");
    assert.match(result.sunset, /^\d{1,2}:\d{2}\s(AM|PM)$/, "sunset must match standard time format");
    assert.ok(result.daylightStr.includes("h"), "daylight string must include hours");
    assert.ok(result.nightStr.includes("h"), "night string must include hours");
  });

  it("accurately derives daytime vs nighttime status based on current time", () => {
    const lat = 28.6139;
    const lon = 77.2090;

    // Noon time in UTC (approx 5:30 PM IST) -> should be day
    const dayDate = new Date("2026-03-20T06:30:00Z");
    const dayResult = calculateSolarCycle(lat, lon, dayDate);
    assert.equal(dayResult.isDay, true, "12:00 PM IST should be daytime");
    assert.ok(dayResult.dayProgress > 0 && dayResult.dayProgress < 1, "dayProgress should be between 0 and 1 during day");

    // Midnight in UTC -> should be night
    const nightDate = new Date("2026-03-20T18:30:00Z");
    const nightResult = calculateSolarCycle(lat, lon, nightDate);
    assert.equal(nightResult.isDay, false, "12:00 AM IST should be nighttime");
  });

  it("applies target geographic timezone offset rather than browser client time", () => {
    const lat = 28.6139;
    const lon = 77.2090;
    const refDate = new Date("2026-03-20T12:00:00Z");

    // Explicitly pass Indian Standard Time offset (+330 minutes)
    const resultIST = calculateSolarCycle(lat, lon, refDate, 330);

    // Pass London GMT offset (0 minutes)
    const resultGMT = calculateSolarCycle(lat, lon, refDate, 0);

    assert.notEqual(resultIST.sunrise, resultGMT.sunrise, "sunrise should shift when timezone offset changes");
  });

  it("handles extreme coordinates gracefully without throwing exceptions", () => {
    // Extreme high latitude near Arctic (Tromsø, Norway in winter)
    const northLat = 69.6492;
    const northLon = 18.9553;
    const winterDate = new Date("2026-12-21T12:00:00Z");

    assert.doesNotThrow(() => {
      const res = calculateSolarCycle(northLat, northLon, winterDate);
      assert.ok(res);
      assert.ok(res.sunrise);
    });

    // Zero / equator coordinates
    assert.doesNotThrow(() => {
      const res = calculateSolarCycle(0, 0, new Date("2026-06-21T12:00:00Z"));
      assert.ok(res);
      assert.equal(typeof res.isDay, "boolean");
    });
  });

  it("provides upcoming countdown event", () => {
    const lat = 28.6139;
    const lon = 77.2090;
    const res = calculateSolarCycle(lat, lon, new Date());

    assert.ok(res.nextEvent, "nextEvent should be defined");
    assert.ok(["sunrise", "sunset"].includes(res.nextEvent.type), "nextEvent type must be sunrise or sunset");
    assert.ok(res.nextEvent.countdown, "countdown string must exist");
  });
});
