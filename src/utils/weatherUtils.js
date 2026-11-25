/**
 * Meteorological calculation and formatting utilities
 */

function toFiniteNumber(val) {
  if (val === undefined || val === null || val === "" || typeof val === "boolean") {
    return null;
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

/**
 * Calculates Dew Point in Celsius using the Magnus-Tetens approximation
 * @param {number} tempC - Temperature in Celsius
 * @param {number} humidity - Relative humidity percentage (0-100)
 * @returns {number|null} - Dew point in Celsius, rounded to 1 decimal place
 */
export function calculateDewPoint(tempC, humidity) {
  const t = toFiniteNumber(tempC);
  const rawH = toFiniteNumber(humidity);
  if (t === null || rawH === null) {
    return null;
  }

  const a = 17.27;
  const b = 237.7;
  if (b + t === 0) return null;

  const h = Math.max(1, Math.min(100, rawH));
  const alpha = (a * t) / (b + t) + Math.log(h / 100);
  if (a - alpha === 0) return null;

  const dewPoint = (b * alpha) / (a - alpha);
  return Number.isFinite(dewPoint) ? Math.round(dewPoint * 10) / 10 : null;
}

/**
 * Categorizes dew point into human-perceived comfort levels
 */
export function getDewPointComfort(dewPointC) {
  const val = toFiniteNumber(dewPointC);
  if (val === null) return "Normal";
  if (val < 10) return "Dry & crisp";
  if (val <= 15) return "Very comfortable";
  if (val <= 19) return "Noticeably humid";
  if (val <= 23) return "Muggy & sticky";
  return "Oppressive & stifling";
}

/**
 * Categorizes UV index with standard WHO scale
 */
export function getUVCategory(uv) {
  const parsed = toFiniteNumber(uv);
  const val = parsed === null ? 0 : Math.max(0, parsed);
  if (val <= 2) {
    return {
      level: "Low",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10 border-emerald-500/20",
      advice: "Minimal sun protection needed"
    };
  }
  if (val <= 5) {
    return {
      level: "Moderate",
      color: "text-amber-500",
      bg: "bg-amber-500/10 border-amber-500/20",
      advice: "Wear sunglasses & SPF 30+"
    };
  }
  if (val <= 7) {
    return {
      level: "High",
      color: "text-orange-500",
      bg: "bg-orange-500/10 border-orange-500/20",
      advice: "Seek shade during midday"
    };
  }
  if (val <= 10) {
    return {
      level: "Very High",
      color: "text-rose-500",
      bg: "bg-rose-500/10 border-rose-500/20",
      advice: "Take extra precautions outdoors"
    };
  }
  return {
    level: "Extreme",
    color: "text-purple-500",
    bg: "bg-purple-500/10 border-purple-500/20",
    advice: "Avoid outdoor sun exposure"
  };
}

/**
 * Converts compass degrees (0-360, or negative) to 16-point cardinal compass direction
 */
export function getWindDirection(deg) {
  const numDeg = toFiniteNumber(deg);
  if (numDeg === null) return "N";
  const cardinals = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
  ];
  const normalizedDeg = ((numDeg % 360) + 360) % 360;
  const index = Math.round(normalizedDeg / 22.5) % 16;
  return cardinals[index];
}

/**
 * Beaufort scale summary based on wind speed in km/h
 */
export function getBeaufortDescription(kph) {
  const parsed = toFiniteNumber(kph);
  const val = parsed === null ? 0 : Math.max(0, parsed);
  if (val < 2) return "Calm";
  if (val <= 5) return "Light air";
  if (val <= 11) return "Light breeze";
  if (val <= 19) return "Gentle breeze";
  if (val <= 28) return "Moderate breeze";
  if (val <= 38) return "Fresh breeze";
  if (val <= 49) return "Strong breeze";
  if (val <= 61) return "High wind";
  return "Gale force";
}

/**
 * Visibility description based on distance in km
 */
export function getVisibilityDescription(km) {
  const val = toFiniteNumber(km);
  if (val === null) return "Fair";
  if (val < 1) return "Dense fog / low";
  if (val < 4) return "Hazy / moderate";
  if (val < 9) return "Fair clarity";
  return "Clear & optimal";
}

/**
 * Atmospheric pressure assessment
 */
export function getPressureStatus(pressureHpa) {
  const val = toFiniteNumber(pressureHpa);
  if (val === null || val <= 0) return "Normal";
  if (val < 1005) return "Low (Unsettled)";
  if (val <= 1018) return "Normal (Stable)";
  return "High (Settled)";
}
