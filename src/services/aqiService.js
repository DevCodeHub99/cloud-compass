import { AQI_PROXY_BASE } from "../constants/api.js";
import { logger } from "../utils/logger.js";

function buildTimeoutSignal(timeoutMs, externalSignal) {
  const timeoutSignal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(timeoutMs)
      : null;

  if (externalSignal && timeoutSignal && typeof AbortSignal.any === "function") {
    return { signal: AbortSignal.any([externalSignal, timeoutSignal]), cleanup: () => {} };
  }

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort(externalSignal.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }
  const timerId = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timerId);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
    }
  };
}

/**
 * Standardized fetch via same-origin /api/aqi proxy with timeout and cancellation support.
 * Keeps authorization tokens strictly server-side.
 */
async function aqiFetch(path, params = {}, options = {}) {
  const { timeoutMs = 10000, signal: externalSignal } =
    typeof options === "number" ? { timeoutMs: options } : options;

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(`${AQI_PROXY_BASE}`, origin);
  url.searchParams.set("endpoint", path);

  Object.keys(params).forEach((key) => {
    if (params[key] !== undefined && params[key] !== null) {
      url.searchParams.append(key, String(params[key]));
    }
  });

  const targetUrl = typeof window !== "undefined" ? `${url.pathname}${url.search}` : url.toString();
  const { signal, cleanup } = buildTimeoutSignal(timeoutMs, externalSignal);

  try {
    const response = await fetch(targetUrl, {
      headers: { Accept: "application/json" },
      signal
    });

    if (response.status === 401) {
      logger.warn("AQI proxy responded with 401 Unauthorized (token awaiting renewal).");
      throw new Error(
        "Air quality telemetry is temporarily unavailable while service authorization is being refreshed."
      );
    }

    if (!response.ok) {
      if (response.status === 404) {
        return { status: "not_found", message: "Not found", data: {} };
      }
      throw new Error(`Telemetry service error (${response.status})`);
    }

    return response.json();
  } catch (err) {
    if (externalSignal?.aborted) {
      throw err;
    }
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      logger.warn(`Telemetry request timed out after ${timeoutMs}ms: ${path}`);
      throw new Error("Telemetry request timed out. Please check your network connection.");
    }
    throw err;
  } finally {
    cleanup();
  }
}

/**
 * Calculates straight-line distance between two coordinates in km/meters
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  if (
    lat1 === undefined || lat1 === null || lat1 === "" ||
    lon1 === undefined || lon1 === null || lon1 === "" ||
    lat2 === undefined || lat2 === null || lat2 === "" ||
    lon2 === undefined || lon2 === null || lon2 === ""
  ) {
    return null;
  }

  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);

  if (
    !Number.isFinite(nLat1) ||
    !Number.isFinite(nLon1) ||
    !Number.isFinite(nLat2) ||
    !Number.isFinite(nLon2)
  ) {
    return null;
  }

  const R = 6371;
  const dLat = ((nLat2 - nLat1) * Math.PI) / 180;
  const dLon = ((nLon2 - nLon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((nLat1 * Math.PI) / 180) *
      Math.cos((nLat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const clampedA = Math.max(0, Math.min(1, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
  const d = R * c;
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
}

/**
 * Fetch live city or specific station telemetry by slug
 * Automatically detects type=4 for stations with 4-segment slugs
 */
export async function fetchAQIBySlug(slug, overrideType) {
  const parts = String(slug || "").split("/").filter(Boolean);
  const type = overrideType || (parts.length >= 4 ? 4 : 3);

  const result = await aqiFetch("/aqi/v2/getLocationDetailsBySlug", {
    slug,
    type,
    source: "web"
  });

  if (result.status?.toLowerCase() === "success" && Array.isArray(result.data) && result.data.length > 0) {
    return result.data[0];
  }
  throw new Error("No air quality telemetry found for this location.");
}

/**
 * Fetch closest physical sensor and air quality by coordinates (lat, lon)
 * Queries type=1 first to pinpoint the exact closest physical station in the neighborhood!
 */
export async function fetchAQIByCoords(lat, lon) {
  try {
    const nearestResult = await aqiFetch("/aqi/v2/getNearestLocation", {
      lat,
      long: lon,
      type: 1,
      source: "web"
    });

    if (
      nearestResult.status?.toLowerCase() === "success" &&
      Array.isArray(nearestResult.data) &&
      nearestResult.data.length > 0
    ) {
      return nearestResult.data[0];
    }
  } catch (err) {
    logger.debug("Type 1 nearest sensor lookup failed, trying anchor fallback:", err);
  }

  const anchorResult = await aqiFetch("/aqi/v2/getNearestLocation", {
    lat,
    long: lon,
    type: 2,
    source: "web"
  });

  if (anchorResult.status?.toLowerCase() === "success" && Array.isArray(anchorResult.data) && anchorResult.data.length > 0) {
    return anchorResult.data[0];
  }

  throw new Error("No nearby monitoring station found for your coordinates.");
}

/**
 * Fetch nearby neighborhood stations by coordinates
 */
export async function fetchNearbyStations(lat, lon) {
  try {
    const result = await aqiFetch("/aqi/v2/getNearestLocation", {
      lat,
      long: lon,
      type: 1,
      source: "web"
    });

    if (result.data && Array.isArray(result.data)) {
      return result.data;
    }
    return [];
  } catch (err) {
    logger.warn("Failed to fetch nearby stations:", err);
    return [];
  }
}

const TREND_RANGE_ENDPOINTS = {
  "24h": "/aqi/v3/getLast24HourHistory",
  "7d": "/aqi/getLast7DaysHistory",
  "30d": "/aqi/getLast30DaysHistory"
};

function deriveCitySlug(slug) {
  const parts = String(slug || "").split("/").filter(Boolean);
  return parts.length >= 4 ? parts.slice(0, 3).join("/") : null;
}

async function fetchTrendSingle(endpoint, slug, signal) {
  const parts = String(slug || "").split("/").filter(Boolean);
  const slugType = parts.length >= 4 ? "locationId" : "cityId";

  const result = await aqiFetch(
    endpoint,
    {
      slug,
      sensorname: "AQI-IN",
      slugType,
      source: "web"
    },
    { signal }
  );

  if (result.status?.toLowerCase() === "success" && result.data) {
    return result.data;
  }
  return null;
}

/**
 * Fetch hourly or multi-day AQI trend history ("24h" | "7d" | "30d") for a city or station slug.
 * Falls back to parent city slug when a specific station returns empty or truncated (< 14 days on 30d) history.
 */
export async function fetchAQITrend(slug, range = "24h", options = {}) {
  const { signal, fallbackSlug } =
    options && typeof options === "object" && "aborted" in options
      ? { signal: options, fallbackSlug: null }
      : options || {};

  const endpoint = TREND_RANGE_ENDPOINTS[range] || TREND_RANGE_ENDPOINTS["24h"];
  const cityFallback = fallbackSlug || deriveCitySlug(slug);
  const minExpected = range === "30d" ? 14 : 1;

  try {
    const primaryData = await fetchTrendSingle(endpoint, slug, signal);
    const primaryLen = Array.isArray(primaryData?.averageArray) ? primaryData.averageArray.length : 0;

    if (primaryLen >= minExpected || !cityFallback || cityFallback === slug) {
      return primaryData;
    }

    try {
      const fallbackData = await fetchTrendSingle(endpoint, cityFallback, signal);
      const fallbackLen = Array.isArray(fallbackData?.averageArray) ? fallbackData.averageArray.length : 0;
      if (fallbackLen > primaryLen) {
        return { ...fallbackData, isCityFallback: true };
      }
    } catch (fallbackErr) {
      if (signal?.aborted || fallbackErr.name === "AbortError") {
        throw fallbackErr;
      }
    }

    return primaryData;
  } catch (err) {
    if (signal?.aborted || err.name === "AbortError") {
      throw err;
    }
    logger.warn(`Failed to fetch ${range} AQI history:`, err);
    return null;
  }
}

/**
 * Search locations (cities, states, stations) for autocomplete
 */
export async function searchAQILocations(query, signal) {
  if (!query || query.trim().length < 2) return [];

  try {
    const result = await aqiFetch(
      "/aqi/searchLocationCityStateCountry",
      {
        searchString: query.trim(),
        source: "web"
      },
      { signal }
    );

    if (result.status?.toLowerCase() === "success" && result.data) {
      const cities = (result.data.cities || []).map((c) => ({
        ...c,
        isStation: false
      }));
      const stations = (result.data.stations || []).map((s) => ({
        ...s,
        isStation: true,
        displayName:
          s.station ||
          s.location ||
          (s.slug ? s.slug.split("/").pop().replace(/-/g, " ") : "Sensor")
      }));
      return [...cities, ...stations].slice(0, 12);
    }
    return [];
  } catch (err) {
    if (signal?.aborted || err.name === "AbortError") {
      throw err;
    }
    logger.warn("Failed location search:", err);
    return [];
  }
}

/**
 * Fetch top polluted cities leaderboard
 */
export async function fetchTopPollutedCities(limit = 6) {
  try {
    const result = await aqiFetch("/aqi/getAirQualityRanklistCountryAndCity", {
      sensorname: "AQI-IN",
      type: 2,
      limit,
      source: "web"
    });

    if (result.status?.toLowerCase() === "success" && Array.isArray(result.data)) {
      return result.data;
    }
    return [];
  } catch (err) {
    logger.warn("Failed to fetch top polluted cities:", err);
    return [];
  }
}
