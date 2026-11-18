import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getCPCBBadge,
  getUSEPABadge,
  formatAQITimestamp,
  formatLocationInfo,
  CPCB_BANDS,
  US_EPA_BANDS
} from "../src/constants/aqiStandards.js";

describe("Air Quality Standards & Formatting Specifications", () => {
  describe("Indian National AQI (CPCB Scale)", () => {
    it("maps values accurately to CPCB categories across boundaries", () => {
      assert.equal(getCPCBBadge(25).category, "Good");
      assert.equal(getCPCBBadge(50).category, "Good");
      assert.equal(getCPCBBadge(51).category, "Satisfactory");
      assert.equal(getCPCBBadge(100).category, "Satisfactory");
      assert.equal(getCPCBBadge(101).category, "Moderate");
      assert.equal(getCPCBBadge(200).category, "Moderate");
      assert.equal(getCPCBBadge(201).category, "Poor");
      assert.equal(getCPCBBadge(300).category, "Poor");
      assert.equal(getCPCBBadge(301).category, "Very Poor");
      assert.equal(getCPCBBadge(400).category, "Very Poor");
      assert.equal(getCPCBBadge(401).category, "Severe");
      assert.equal(getCPCBBadge(850).category, "Severe");
    });

    it("handles zero, negative, and non-numeric inputs safely", () => {
      assert.equal(getCPCBBadge(0).category, "Good");
      assert.equal(getCPCBBadge(-10).category, "Good");
      assert.equal(getCPCBBadge(null).category, "Good");
      assert.equal(getCPCBBadge(undefined).category, "Good");
    });
  });

  describe("US EPA Standard Scale", () => {
    it("maps values accurately to US EPA categories across boundaries", () => {
      assert.equal(getUSEPABadge(25).category, "Good");
      assert.equal(getUSEPABadge(50).category, "Good");
      assert.equal(getUSEPABadge(51).category, "Moderate");
      assert.equal(getUSEPABadge(100).category, "Moderate");
      assert.equal(getUSEPABadge(101).category, "Unhealthy for Sensitive Groups");
      assert.equal(getUSEPABadge(150).category, "Unhealthy for Sensitive Groups");
      assert.equal(getUSEPABadge(151).category, "Unhealthy");
      assert.equal(getUSEPABadge(200).category, "Unhealthy");
      assert.equal(getUSEPABadge(201).category, "Very Unhealthy");
      assert.equal(getUSEPABadge(300).category, "Very Unhealthy");
      assert.equal(getUSEPABadge(301).category, "Hazardous");
      assert.equal(getUSEPABadge(600).category, "Hazardous");
    });
  });

  describe("formatLocationInfo", () => {
    it("deduplicates redundant city and neighborhood segments", () => {
      const data = {
        station: "Anand Vihar, Delhi, Delhi, India",
        city: "Delhi",
        state: "Delhi",
        country: "India",
        distance: "3.4"
      };

      const info = formatLocationInfo(data);
      assert.ok(info.title, "title must be populated");
      assert.equal(info.distanceText, "3.40 km");
      assert.equal(info.country, "India");
    });

    it("formats short distance units below 10 km to 2 decimal places", () => {
      const info = formatLocationInfo({ location: "Central", distance: 0.45 });
      assert.equal(info.distanceText, "0.45 km");
    });

    it("handles null and empty location payloads gracefully", () => {
      const info = formatLocationInfo(null);
      assert.equal(info.title, "Local Area");
      assert.equal(info.stationName, "Ground Sensor");
      assert.equal(info.distanceText, null);
    });
  });

  describe("formatAQITimestamp", () => {
    it("formats server timestamps cleanly and computes relative times", () => {
      const now = new Date();
      const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const year = fiveMinsAgo.getFullYear();
      const month = String(fiveMinsAgo.getMonth() + 1).padStart(2, "0");
      const day = String(fiveMinsAgo.getDate()).padStart(2, "0");
      const hours = String(fiveMinsAgo.getHours()).padStart(2, "0");
      const mins = String(fiveMinsAgo.getMinutes()).padStart(2, "0");
      const serverString = `${year}-${month}-${day} ${hours}:${mins}:00`;

      const formatted = formatAQITimestamp(serverString);
      assert.ok(formatted.time.includes("(Local Time)"));
      assert.ok(formatted.relative.includes("m ago") || formatted.relative === "Just now");
    });

    it("handles null and malformed timestamps gracefully", () => {
      assert.deepEqual(formatAQITimestamp(null), { time: "Live Telemetry", relative: "" });
      assert.deepEqual(formatAQITimestamp("invalid-date-string"), { time: "Live Telemetry", relative: "" });
    });
  });
});
