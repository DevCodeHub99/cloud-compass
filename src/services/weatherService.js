import { DEFAULT_WEATHER_ICON } from "../constants/api.js";
import { calculateSolarCycle } from "../utils/solarCalculator.js";
import { formatLocationInfo } from "../constants/aqiStandards.js";

function toNum(val, fallback) {
  if (val === undefined || val === null || val === "" || typeof val === "boolean") {
    return fallback;
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

function pickCoord(primary, secondary) {
  const p = toNum(primary, null);
  if (p !== null) return p;
  return toNum(secondary, null);
}

function formatHourLabel(dateUtcShifted) {
  let hrs = dateUtcShifted.getUTCHours();
  const ampm = hrs >= 12 ? "PM" : "AM";
  hrs = hrs % 12 || 12;
  return `${hrs} ${ampm}`;
}

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Derives modeled 24-hour diurnal temperature curve anchored to actual aqi.in telemetry
 * and formatted in the target city's timezone offset.
 */
function generateHourlyFromTelemetry(
  currentTemp,
  humidity,
  cloud,
  precipMm,
  baseCondition,
  iconUrl,
  tzOffsetMinutes = 0
) {
  const hourly = [];
  const nowMs = Date.now();
  const offsetMs = tzOffsetMinutes * 60000;
  const localNow = new Date(nowMs + offsetMs);
  const currentHour = localNow.getUTCHours();

  const swingFactor = Math.max(4, Math.min(12, 10 * (1 - (cloud || 0) / 200)));
  const peakHour = 14.5;

  for (let i = 0; i < 24; i += 1) {
    const targetEpochMs = nowMs + i * 3600 * 1000;
    const targetLocal = new Date(targetEpochMs + offsetMs);
    const hour = targetLocal.getUTCHours();
    const isNow = i === 0;

    const phase = ((hour - peakHour) / 24) * 2 * Math.PI;
    const tempOffset = Math.cos(phase) * (swingFactor / 2);

    const currentPhaseOffset = Math.cos(((currentHour - peakHour) / 24) * 2 * Math.PI) * (swingFactor / 2);
    const simulatedTemp = Math.round(currentTemp - currentPhaseOffset + tempOffset);
    const simulatedHumidity = Math.max(20, Math.min(95, Math.round(humidity - tempOffset * 2.5)));
    const pop = Math.min(90, Math.round((precipMm > 0 ? 60 : 0) + (cloud || 0) * 0.4));

    const isNight = hour < 6 || hour >= 19;
    const timeStr = isNow ? "Now" : formatHourLabel(targetLocal);

    hourly.push({
      dt: Math.floor(targetEpochMs / 1000),
      timeStr,
      hour,
      temp: isNow ? Math.round(currentTemp) : simulatedTemp,
      feels_like: isNow ? Math.round(currentTemp) : Math.round(simulatedTemp + (simulatedHumidity > 60 ? 1 : -1)),
      icon: iconUrl || DEFAULT_WEATHER_ICON,
      condition: isNight && baseCondition.toLowerCase().includes("clear") ? "Clear Night" : baseCondition,
      description: baseCondition,
      pop,
      humidity: simulatedHumidity,
      windSpeed: Math.max(3, Math.round(10 + Math.cos(phase) * 4)),
      isModeled: !isNow
    });
  }

  return hourly;
}

/**
 * Generates meteorological narrative advisory based on telemetry and trend
 */
function getAtmosphericAdvisory(currentTemp, condition, uv, maxPop, cloud) {
  const condLower = (condition || "").toLowerCase();
  if (condLower.includes("rain") || maxPop > 45) {
    return "Precipitation expected in the area; carrying an umbrella is recommended.";
  }
  if (condLower.includes("haze") || condLower.includes("smoke")) {
    return "Atmospheric haze present with reduced clarity; conditions steady through the evening.";
  }
  if (uv >= 6) {
    return "High midday UV intensity expected; sun protection and hydration recommended.";
  }
  if (currentTemp >= 33) {
    return "Warm temperatures persisting; stay well-hydrated throughout outdoor activities.";
  }
  if (currentTemp <= 14) {
    return "Chilly evening breeze expected; an extra warm layer is recommended.";
  }
  if (cloud < 20) {
    return "Predominantly clear skies expected; optimal conditions for outdoor activities.";
  }
  return "Partly cloudy conditions expected with comfortable temperatures throughout.";
}

/**
 * Projects a modeled 5-day meteorological outlook from aqi.in physical station observations
 * formatted in the target city's timezone offset.
 */
function generateDailyFromTelemetry(
  currentTemp,
  humidity,
  pressure,
  cloud,
  precipMm,
  baseCondition,
  iconUrl,
  tzOffsetMinutes = 0
) {
  const daily = [];
  const nowMs = Date.now();
  const offsetMs = tzOffsetMinutes * 60000;
  const swing = Math.max(6, Math.min(12, 9 * (1 - (cloud || 0) / 220)));

  const pressureDrift = pressure < 1005 ? -1.5 : pressure > 1020 ? 0.8 : 0;

  for (let d = 0; d < 5; d += 1) {
    const epochMs = nowMs + d * 24 * 3600 * 1000;
    const localDate = new Date(epochMs + offsetMs);
    const dayName = d === 0 ? "Today" : WEEKDAYS_SHORT[localDate.getUTCDay()];
    const dateStr = `${localDate.getUTCDate()} ${MONTHS_SHORT[localDate.getUTCMonth()]}`;

    const dayModulation = Math.sin((d + 1) * 0.9) * 1.5 + d * (pressureDrift * 0.3);
    const maxT = Math.round(currentTemp + swing * 0.5 + dayModulation);
    const minT = Math.round(currentTemp - swing * 0.5 + dayModulation);
    const pop =
      d === 0
        ? precipMm > 0
          ? 50
          : Math.round((cloud || 0) * 0.3)
        : Math.min(80, Math.max(5, Math.round((cloud || 0) * 0.35 + Math.sin(d * 1.2) * 15)));

    daily.push({
      dt: Math.floor(epochMs / 1000),
      dayName,
      dateStr,
      temp_max: maxT,
      temp_min: minT,
      feels_like: Math.round(maxT - 1),
      icon: iconUrl || DEFAULT_WEATHER_ICON,
      condition: baseCondition,
      description: baseCondition,
      pop,
      humidity: Math.max(25, Math.min(85, Math.round(humidity + Math.sin(d) * 5))),
      windSpeed: Math.max(5, Math.round(12 + Math.cos(d) * 3)),
      isModeled: true
    });
  }

  return daily;
}

/**
 * Normalizes an aqi.in location response into a unified weather model.
 */
export function normalizeAQIWeatherData(locationData) {
  if (!locationData) {
    throw new Error("No telemetry provided to normalize weather data.");
  }

  const w = locationData.weather || {};
  const currentTemp = toNum(w.temp_c, 25);
  const feelsLike = toNum(w.feelslike_c, currentTemp);
  const humidity = toNum(w.humidity, 45);
  const pressure = toNum(w.pressure_mb, 1013);
  const windKph = toNum(w.wind_kph, 8);
  const windDeg = toNum(w.wind_degree, 0);
  const windDir = w.wind_dir || "N";
  const gustKph = toNum(w.gust_kph, null);
  const uv = toNum(w.uv, 3);
  const visKm = toNum(w.vis_km, 8);
  const cloud = toNum(w.cloud, 20);
  const precipMm = toNum(w.precip_mm, 0);
  const conditionText = w.condition?.text || "Clear";
  const iconUrl = w.condition?.icon || DEFAULT_WEATHER_ICON;

  const lat = pickCoord(locationData.latitude, locationData.city_lat);
  const lon = pickCoord(locationData.longitude, locationData.city_lon);
  const astronomy = calculateSolarCycle(lat ?? undefined, lon ?? undefined);
  const tzOffsetMinutes = astronomy.effectiveOffsetMinutes ?? 0;

  const halfSwing = Math.max(3, Math.min(6, 4.5 * (1 - cloud / 220)));
  const tempMax = Math.round(currentTemp + halfSwing);
  const tempMin = Math.round(currentTemp - halfSwing);

  const hourly = generateHourlyFromTelemetry(
    currentTemp,
    humidity,
    cloud,
    precipMm,
    conditionText,
    iconUrl,
    tzOffsetMinutes
  );
  const daily = generateDailyFromTelemetry(
    currentTemp,
    humidity,
    pressure,
    cloud,
    precipMm,
    conditionText,
    iconUrl,
    tzOffsetMinutes
  );
  const maxPop = Math.max(...hourly.map((h) => h.pop || 0), 0);
  const advisory = getAtmosphericAdvisory(currentTemp, conditionText, uv, maxPop, cloud);

  const locInfo = formatLocationInfo(locationData);

  return {
    source: "aqi.in Live Telemetry",
    city: {
      name: locInfo.primary,
      secondary: locInfo.secondary,
      fullHierarchy: locInfo.fullHierarchy,
      station: locInfo.stationName,
      country: locInfo.country || "IN",
      state: locInfo.state || "",
      coord: {
        lat,
        lon
      }
    },
    current: {
      temp: Math.round(currentTemp),
      feels_like: Math.round(feelsLike),
      temp_max: tempMax,
      temp_min: tempMin,
      humidity,
      pressure,
      pressure_in: w.pressure_in,
      windSpeed: Math.round((windKph / 3.6) * 10) / 10,
      wind_kph: windKph,
      wind_degree: windDeg,
      wind_dir: windDir,
      gust_kph: gustKph,
      uv,
      uv_condition: w.uv_condition?.text,
      vis_km: visKm,
      vis_miles: w.vis_miles,
      cloud,
      precip_mm: precipMm,
      condition: conditionText,
      description: conditionText,
      icon: iconUrl,
      is_day: w.is_day ?? 1,
      last_updated: w.last_updated || new Date().toISOString(),
      advisory,
      isPhysicalSensor: true
    },
    advisory,
    astronomy,
    hourly,
    daily
  };
}
