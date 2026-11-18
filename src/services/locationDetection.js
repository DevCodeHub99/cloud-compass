import { STORAGE_KEYS, DEFAULT_LOCATION } from "../constants/api.js";
import { logger } from "../utils/logger.js";

/**
 * Universal fetch with configurable timeout abort controller
 */
async function fetchWithTimeout(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Derives a human-readable city from browser IANA timezone
 * e.g., "America/New_York" -> "New York", "Europe/London" -> "London", "Asia/Kolkata" -> "Kolkata"
 * 100% offline, zero network requests, zero latency.
 */
export function getCityFromTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || !tz.includes("/")) return null;
    const parts = tz.split("/");
    const rawCity = parts[parts.length - 1].replace(/_/g, " ");
    return rawCity || null;
  } catch (err) {
    logger.debug("Failed to extract city from timezone:", err);
    return null;
  }
}

/**
 * Retrieves the last active location saved in localStorage
 */
export function getSavedLocation() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEYS.LAST_LOCATION);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.city || (parsed.lat && parsed.lon))) {
          return parsed;
        }
      }
    }
  } catch (err) {
    logger.debug("Could not read saved location from localStorage:", err);
  }
  return null;
}

/**
 * Persists the current active location to localStorage
 */
export function saveLastLocation(location) {
  try {
    if (typeof window !== "undefined" && window.localStorage && location) {
      window.localStorage.setItem(STORAGE_KEYS.LAST_LOCATION, JSON.stringify(location));
    }
  } catch (err) {
    logger.debug("Could not save last location to localStorage:", err);
  }
}

/**
 * Resolves approximate user location via a multi-tiered progressive strategy:
 * 1. Vercel Edge CDN Headers (/api/geo) - Zero 3rd-party network overhead
 * 2. Public CORS IP Geolocation (freeipapi.com)
 * 3. Secondary IP Geolocation (ipwho.is)
 * 4. Browser IANA Timezone Heuristic
 */
export async function detectApproximateLocation() {
  // 1. Try Vercel edge function (instant on Vercel deployment)
  try {
    const edgeRes = await fetchWithTimeout("/api/geo", 1500);
    if (edgeRes.ok) {
      const data = await edgeRes.json();
      if (data && (data.city || (data.lat && data.lon))) {
        logger.info("Approximate location resolved via Vercel Edge:", data.city || `${data.lat}, ${data.lon}`);
        return {
          city: data.city || null,
          country: data.country || null,
          lat: data.lat ? Number(data.lat) : null,
          lon: data.lon ? Number(data.lon) : null,
          source: "edge-ip"
        };
      }
    }
  } catch (e) {
    logger.debug("Edge location lookup unavailable:", e.message);
  }

  // 2. Try free, CORS-friendly client IP service (freeipapi.com)
  try {
    const ipRes = await fetchWithTimeout("https://freeipapi.com/api/json", 2500);
    if (ipRes.ok) {
      const data = await ipRes.json();
      if (data && (data.cityName || data.latitude)) {
        logger.info("Approximate location resolved via freeipapi:", data.cityName);
        return {
          city: data.cityName || null,
          country: data.countryCode || null,
          lat: data.latitude ? Number(data.latitude) : null,
          lon: data.longitude ? Number(data.longitude) : null,
          source: "client-ip"
        };
      }
    }
  } catch (e) {
    logger.debug("freeipapi lookup failed:", e.message);
  }

  // 3. Fallback to secondary IP service (ipwho.is)
  try {
    const whoRes = await fetchWithTimeout("https://ipwho.is/", 2500);
    if (whoRes.ok) {
      const data = await whoRes.json();
      if (data && data.success && (data.city || data.latitude)) {
        logger.info("Approximate location resolved via ipwho.is:", data.city);
        return {
          city: data.city || null,
          country: data.country_code || null,
          lat: data.latitude ? Number(data.latitude) : null,
          lon: data.longitude ? Number(data.longitude) : null,
          source: "client-ip"
        };
      }
    }
  } catch (e) {
    logger.debug("ipwho.is lookup failed:", e.message);
  }

  // 4. Fallback to Browser Timezone heuristic (100% offline, 0ms)
  const tzCity = getCityFromTimezone();
  if (tzCity) {
    logger.info("Approximate location resolved via browser timezone:", tzCity);
    return {
      city: tzCity,
      country: null,
      lat: null,
      lon: null,
      source: "browser-timezone"
    };
  }

  return {
    ...DEFAULT_LOCATION,
    source: "static-fallback"
  };
}
