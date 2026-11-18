import { AQI_API_BASE, DEFAULT_AQI_TOKEN, STORAGE_KEYS } from "../constants/api.js";
import { logger } from "../utils/logger.js";

/**
 * Safely decodes and parses the payload of a JWT token without external dependencies
 */
export function parseJwtPayload(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Checks whether a JWT token has expired or is invalid
 */
export function isTokenExpired(token) {
  const payload = parseJwtPayload(token);
  if (!payload) return true;
  if (!payload.exp) return false;
  // 60-second proactive buffer before wall-clock expiry
  return Date.now() >= payload.exp * 1000 - 60000;
}

/**
 * Returns expiration metadata for telemetry JWT tokens
 */
export function getTokenExpirationInfo(token) {
  const payload = parseJwtPayload(token);
  if (!payload || !payload.exp) return null;
  const remainingMs = payload.exp * 1000 - Date.now();
  return {
    exp: payload.exp,
    isExpired: remainingMs <= 60000,
    remainingDays: Math.max(0, Math.round(remainingMs / (1000 * 60 * 60 * 24)))
  };
}

/**
 * Manages Bearer Token with localStorage persistence & fallback
 * Proactively verifies token expiration to eliminate stale 401 loops
 */
function getToken() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const cached = window.localStorage.getItem(STORAGE_KEYS.AQI_TOKEN);
      if (cached && cached.startsWith("ey")) {
        if (!isTokenExpired(cached)) {
          return cached;
        }
        // Purge expired cached token immediately
        window.localStorage.removeItem(STORAGE_KEYS.AQI_TOKEN);
        logger.warn("Purged expired telemetry token from local storage.");
      }
    }
  } catch (e) {
    logger.debug("Could not access localStorage for token:", e);
  }

  // Observability: Check bootstrap token expiration lifecycle
  const info = getTokenExpirationInfo(DEFAULT_AQI_TOKEN);
  if (info) {
    if (info.isExpired) {
      logger.error("Default bootstrap AQI token has expired. Supply VITE_AQI_TOKEN in .env.local.");
    } else if (info.remainingDays <= 3) {
      logger.warn(`Default bootstrap AQI token will expire in ${info.remainingDays} days.`);
    }
  }

  return DEFAULT_AQI_TOKEN;
}

function saveToken(token) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      if (token && !isTokenExpired(token)) {
        window.localStorage.setItem(STORAGE_KEYS.AQI_TOKEN, token);
      } else {
        window.localStorage.removeItem(STORAGE_KEYS.AQI_TOKEN);
      }
    }
  } catch (e) {
    logger.debug("Could not save token to localStorage:", e);
  }
}

/**
 * Standardized authenticated fetch for apiserver.aqi.in with timeout and self-healing token retry
 */
async function aqiFetch(path, params = {}, timeoutMs = 10000) {
  const token = getToken();
  const url = new URL(`${AQI_API_BASE}${path}`);
  Object.keys(params).forEach((key) => {
    if (params[key] !== undefined && params[key] !== null) {
      url.searchParams.append(key, params[key]);
    }
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json"
  };

  try {
    const response = await fetch(url.toString(), {
      headers,
      signal: controller.signal
    });

    if (response.status === 401) {
      logger.warn("AQI API responded with 401 Unauthorized. Purging stale token...");
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.removeItem(STORAGE_KEYS.AQI_TOKEN);
        }
      } catch {}

      // If the current token was NOT the bootstrap token, retry once with the bootstrap token
      if (token !== DEFAULT_AQI_TOKEN && !isTokenExpired(DEFAULT_AQI_TOKEN)) {
        logger.info("Retrying telemetry request with fresh bootstrap token...");
        clearTimeout(timeoutId);
        const retryController = new AbortController();
        const retryTimeoutId = setTimeout(() => retryController.abort(), timeoutMs);
        try {
          const retryRes = await fetch(url.toString(), {
            headers: { ...headers, Authorization: `Bearer ${DEFAULT_AQI_TOKEN}` },
            signal: retryController.signal
          });
          if (retryRes.ok) {
            saveToken(DEFAULT_AQI_TOKEN);
            return retryRes.json();
          }
        } finally {
          clearTimeout(retryTimeoutId);
        }
      }

      throw new Error(
        "AQI API Unauthorized (401). Telemetry authorization token has expired or is invalid. Set VITE_AQI_TOKEN in .env.local to update."
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
    if (err.name === "AbortError") {
      logger.warn(`Telemetry request timed out after ${timeoutMs}ms: ${path}`);
      throw new Error("Telemetry request timed out. Please check your network connection.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Calculates straight-line distance between two coordinates in km/meters
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  if (
    lat1 === undefined || lat1 === null ||
    lon1 === undefined || lon1 === null ||
    lat2 === undefined || lat2 === null ||
    lon2 === undefined || lon2 === null
  ) {
    return null;
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

  if (result.status === "success" && result.data && result.data.length > 0) {
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
    // 1. High precision: get nearest physical sensor in neighborhood (type=1)
    const nearestResult = await aqiFetch("/aqi/v2/getNearestLocation", {
      lat,
      long: lon,
      type: 1,
      source: "web"
    });

    if (
      nearestResult.status?.toLowerCase() === "success" &&
      nearestResult.data &&
      nearestResult.data.length > 0
    ) {
      // First item is the closest sensor to these exact coordinates!
      return nearestResult.data[0];
    }
  } catch (err) {
    logger.debug("Type 1 nearest sensor lookup failed, trying anchor fallback:", err);
  }

  // 2. Fallback to anchor city level (type=2)
  const anchorResult = await aqiFetch("/aqi/v2/getNearestLocation", {
    lat,
    long: lon,
    type: 2,
    source: "web"
  });

  if (anchorResult.status?.toLowerCase() === "success" && anchorResult.data && anchorResult.data.length > 0) {
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

/**
 * Fetch 24-hour hourly trend history for a city or station slug
 */
export async function fetch24HourTrend(slug) {
  try {
    const parts = String(slug || "").split("/").filter(Boolean);
    const slugType = parts.length >= 4 ? "locationId" : "cityId";

    const result = await aqiFetch("/aqi/v3/getLast24HourHistory", {
      slug,
      sensorname: "AQI-IN",
      slugType,
      source: "web"
    });

    if (result.status === "success" && result.data) {
      return result.data;
    }
    return null;
  } catch (err) {
    logger.warn("Failed to fetch 24-hour AQI history:", err);
    return null;
  }
}

/**
 * Search locations (cities, states, stations) for autocomplete
 */
export async function searchAQILocations(query) {
  if (!query || query.trim().length < 2) return [];

  try {
    const result = await aqiFetch("/aqi/searchLocationCityStateCountry", {
      searchString: query.trim(),
      source: "web"
    });

    if (result.status === "success" && result.data) {
      const cities = (result.data.cities || []).map((c) => ({
        ...c,
        isStation: false
      }));
      const stations = (result.data.stations || []).map((s) => ({
        ...s,
        isStation: true,
        displayName: s.station || s.location || (s.slug ? s.slug.split("/").pop().replace(/-/g, " ") : "Sensor")
      }));
      return [...cities, ...stations].slice(0, 12);
    }
    return [];
  } catch (err) {
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

    if (result.status === "success" && Array.isArray(result.data)) {
      return result.data;
    }
    return [];
  } catch (err) {
    logger.warn("Failed to fetch top polluted cities:", err);
    return [];
  }
}
