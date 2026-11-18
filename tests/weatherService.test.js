import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeAQIWeatherData } from "../src/services/weatherService.js";

describe("Weather Normalization & Forecast Generation Service", () => {
  it("normalizes aqi.in location telemetry into a unified meteorological model", () => {
    const mockTelemetry = {
      location: "Anand Vihar",
      city: "New Delhi",
      state: "Delhi",
      country: "India",
      latitude: 28.6469,
      longitude: 77.3164,
      weather: {
        temp_c: 24.5,
        feelslike_c: 26.0,
        humidity: 52,
        pressure_mb: 1012,
        wind_kph: 12,
        wind_degree: 180,
        wind_dir: "S",
        uv: 5,
        vis_km: 6,
        cloud: 25,
        precip_mm: 0,
        condition: {
          text: "Haze",
          icon: "https://apiserver.aqi.in/uploads/weather-icons/haze.svg"
        }
      }
    };

    const normalized = normalizeAQIWeatherData(mockTelemetry);

    assert.equal(normalized.source, "aqi.in Live Telemetry");
    assert.equal(normalized.city.name, "Anand Vihar, New Delhi");
    assert.equal(normalized.city.secondary, "Delhi, India");
    assert.equal(normalized.current.temp, 25);
    assert.equal(normalized.current.feels_like, 26);
    assert.equal(normalized.current.humidity, 52);
    assert.equal(normalized.current.pressure, 1012);
    assert.equal(normalized.current.wind_dir, "S");
    assert.equal(normalized.current.condition, "Haze");
    assert.ok(normalized.current.temp_max >= normalized.current.temp_min);
    assert.ok(normalized.astronomy.sunrise);
    assert.ok(normalized.astronomy.sunset);
  });

  it("generates exactly 24 hourly forecasts with contiguous hours", () => {
    const mockTelemetry = {
      city: "Mumbai",
      latitude: 19.0760,
      longitude: 72.8777,
      weather: {
        temp_c: 28,
        humidity: 70,
        condition: { text: "Partly Cloudy" }
      }
    };

    const normalized = normalizeAQIWeatherData(mockTelemetry);

    assert.equal(normalized.hourly.length, 24);
    assert.equal(normalized.hourly[0].timeStr, "Now");
    assert.equal(normalized.hourly[0].temp, 28);

    // Verify all 24 hours have numerical temperatures and humidity
    normalized.hourly.forEach((h, idx) => {
      assert.equal(typeof h.temp, "number");
      assert.equal(typeof h.humidity, "number");
      assert.equal(typeof h.pop, "number");
      assert.ok(h.timeStr.length > 0);
    });
  });

  it("generates exactly 5 daily forecasts with valid min and max temperatures", () => {
    const mockTelemetry = {
      city: "Bengaluru",
      latitude: 12.9716,
      longitude: 77.5946,
      weather: {
        temp_c: 22,
        humidity: 60,
        condition: { text: "Clear" }
      }
    };

    const normalized = normalizeAQIWeatherData(mockTelemetry);

    assert.equal(normalized.daily.length, 5);
    assert.equal(normalized.daily[0].dayName, "Today");

    normalized.daily.forEach((d) => {
      assert.ok(d.temp_max >= d.temp_min, `max (${d.temp_max}) must be >= min (${d.temp_min})`);
      assert.ok(d.condition);
      assert.ok(d.dateStr);
    });
  });

  it("throws a descriptive error when no telemetry payload is provided", () => {
    assert.throws(() => {
      normalizeAQIWeatherData(null);
    }, /No telemetry provided/);
  });

  it("handles missing nested weather fields with safe defaults", () => {
    const emptyWeatherPayload = {
      city: "Kolkata",
      latitude: 22.5726,
      longitude: 88.3639
    };

    const normalized = normalizeAQIWeatherData(emptyWeatherPayload);

    assert.equal(normalized.current.temp, 25); // default fallback
    assert.equal(normalized.current.humidity, 45); // default fallback
    assert.equal(normalized.current.condition, "Clear"); // default fallback
    assert.equal(normalized.hourly.length, 24);
    assert.equal(normalized.daily.length, 5);
  });
});
