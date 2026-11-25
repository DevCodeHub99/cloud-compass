import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateDewPoint,
  getDewPointComfort,
  getUVCategory,
  getWindDirection,
  getBeaufortDescription,
  getVisibilityDescription,
  getPressureStatus
} from "../src/utils/weatherUtils.js";

describe("Meteorological Calculation & Formatting Utilities", () => {
  describe("calculateDewPoint (Magnus-Tetens Formula)", () => {
    it("accurately calculates dew point for typical conditions", () => {
      const dp = calculateDewPoint(25, 50);
      assert.equal(typeof dp, "number");
      assert.ok(Math.abs(dp - 13.9) <= 0.2, `Expected ~13.9°C, got ${dp}`);
    });

    it("returns ambient temperature at 100% relative humidity", () => {
      assert.equal(calculateDewPoint(20, 100), 20);
    });

    it("handles boundary, subzero, and invalid inputs safely", () => {
      const subzeroDp = calculateDewPoint(-5, 60);
      assert.equal(typeof subzeroDp, "number");
      assert.ok(subzeroDp < -5);

      assert.equal(calculateDewPoint(null, 50), null);
      assert.equal(calculateDewPoint(25, null), null);
      assert.equal(calculateDewPoint(undefined, undefined), null);
      assert.equal(calculateDewPoint("", 50), null);
      assert.equal(calculateDewPoint("abc", 50), null);
      assert.equal(calculateDewPoint(-237.7, 50), null);
    });
  });

  describe("getDewPointComfort", () => {
    it("correctly maps comfort labels across all temperature thresholds", () => {
      assert.equal(getDewPointComfort(8), "Dry & crisp");
      assert.equal(getDewPointComfort(13), "Very comfortable");
      assert.equal(getDewPointComfort(17), "Noticeably humid");
      assert.equal(getDewPointComfort(21), "Muggy & sticky");
      assert.equal(getDewPointComfort(26), "Oppressive & stifling");
      assert.equal(getDewPointComfort(null), "Normal");
      assert.equal(getDewPointComfort("invalid"), "Normal");
    });
  });

  describe("getUVCategory (WHO Scale)", () => {
    it("maps UV index values to official WHO threat categories", () => {
      assert.equal(getUVCategory(1).level, "Low");
      assert.equal(getUVCategory(4).level, "Moderate");
      assert.equal(getUVCategory(6.5).level, "High");
      assert.equal(getUVCategory(9).level, "Very High");
      assert.equal(getUVCategory(12).level, "Extreme");
      assert.equal(getUVCategory(0).level, "Low");
      assert.equal(getUVCategory(null).level, "Low");
    });
  });

  describe("getWindDirection", () => {
    it("converts angular compass degrees including negative angles cleanly", () => {
      assert.equal(getWindDirection(0), "N");
      assert.equal(getWindDirection(360), "N");
      assert.equal(getWindDirection(90), "E");
      assert.equal(getWindDirection(180), "S");
      assert.equal(getWindDirection(270), "W");
      assert.equal(getWindDirection(45), "NE");
      assert.equal(getWindDirection(225), "SW");
      assert.equal(getWindDirection(-45), "NW");
      assert.equal(getWindDirection(-90), "W");
      assert.equal(getWindDirection("invalid"), "N");
      assert.equal(getWindDirection(null), "N");
    });
  });

  describe("getBeaufortDescription", () => {
    it("correctly classifies wind speeds into Beaufort categories", () => {
      assert.equal(getBeaufortDescription(1), "Calm");
      assert.equal(getBeaufortDescription(4), "Light air");
      assert.equal(getBeaufortDescription(10), "Light breeze");
      assert.equal(getBeaufortDescription(18), "Gentle breeze");
      assert.equal(getBeaufortDescription(25), "Moderate breeze");
      assert.equal(getBeaufortDescription(35), "Fresh breeze");
      assert.equal(getBeaufortDescription(45), "Strong breeze");
      assert.equal(getBeaufortDescription(55), "High wind");
      assert.equal(getBeaufortDescription(75), "Gale force");
    });
  });

  describe("getVisibilityDescription & getPressureStatus", () => {
    it("categorizes atmospheric visibility and pressure accurately", () => {
      assert.equal(getVisibilityDescription(0.5), "Dense fog / low");
      assert.equal(getVisibilityDescription(3), "Hazy / moderate");
      assert.equal(getVisibilityDescription(7), "Fair clarity");
      assert.equal(getVisibilityDescription(15), "Clear & optimal");
      assert.equal(getVisibilityDescription(null), "Fair");
      assert.equal(getVisibilityDescription("invalid"), "Fair");

      assert.equal(getPressureStatus(1000), "Low (Unsettled)");
      assert.equal(getPressureStatus(1013), "Normal (Stable)");
      assert.equal(getPressureStatus(1025), "High (Settled)");
      assert.equal(getPressureStatus(0), "Normal");
      assert.equal(getPressureStatus("invalid"), "Normal");
      assert.equal(getPressureStatus(null), "Normal");
    });
  });
});
