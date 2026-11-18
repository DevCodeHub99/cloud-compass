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
      // 25°C at 50% relative humidity -> Dew point is approx 13.9°C
      const dp = calculateDewPoint(25, 50);
      assert.equal(typeof dp, "number");
      assert.ok(Math.abs(dp - 13.9) <= 0.2, `Expected ~13.9°C, got ${dp}`);
    });

    it("returns ambient temperature at 100% relative humidity", () => {
      // At 100% RH, dew point equals the ambient temperature
      const dp = calculateDewPoint(20, 100);
      assert.equal(dp, 20);
    });

    it("handles boundary, zero, and subzero temperatures", () => {
      const subzeroDp = calculateDewPoint(-5, 60);
      assert.equal(typeof subzeroDp, "number");
      assert.ok(subzeroDp < -5);

      assert.equal(calculateDewPoint(null, 50), null);
      assert.equal(calculateDewPoint(25, null), null);
      assert.equal(calculateDewPoint(undefined, undefined), null);
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
    it("converts angular compass degrees into 16-point cardinal strings", () => {
      assert.equal(getWindDirection(0), "N");
      assert.equal(getWindDirection(360), "N");
      assert.equal(getWindDirection(90), "E");
      assert.equal(getWindDirection(180), "S");
      assert.equal(getWindDirection(270), "W");
      assert.equal(getWindDirection(45), "NE");
      assert.equal(getWindDirection(225), "SW");
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
    it("categorizes atmospheric visibility accurately", () => {
      assert.equal(getVisibilityDescription(0.5), "Dense fog / low");
      assert.equal(getVisibilityDescription(3), "Hazy / moderate");
      assert.equal(getVisibilityDescription(7), "Fair clarity");
      assert.equal(getVisibilityDescription(15), "Clear & optimal");
      assert.equal(getVisibilityDescription(null), "Fair");
    });

    it("evaluates barometric pressure trends", () => {
      assert.equal(getPressureStatus(1000), "Low (Unsettled)");
      assert.equal(getPressureStatus(1013), "Normal (Stable)");
      assert.equal(getPressureStatus(1025), "High (Settled)");
      assert.equal(getPressureStatus(null), "Normal");
    });
  });
});
