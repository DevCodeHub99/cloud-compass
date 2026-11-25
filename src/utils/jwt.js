/**
 * Shared JWT inspection utilities (zero external dependencies).
 * Used by both server proxy routes (api/) and client UI (src/).
 */

/**
 * Safely decodes and parses the payload of a JWT token without external dependencies.
 * Note: This inspects claims only; cryptographic verification belongs to the issuing server.
 * @param {string} token
 * @returns {object|null}
 */
export function parseJwtPayload(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.trim().split(".");
    if (parts.length !== 3 || !parts[1]) return null;

    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");

    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const jsonPayload = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(jsonPayload);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Checks whether a JWT token is malformed or expired (with proactive buffer).
 * @param {string} token
 * @param {number} [bufferSeconds=60]
 * @returns {boolean}
 */
export function isTokenExpired(token, bufferSeconds = 60) {
  const payload = parseJwtPayload(token);
  if (!payload) return true;
  if (payload.exp === undefined || payload.exp === null) return false;
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return true;
  return Date.now() >= payload.exp * 1000 - bufferSeconds * 1000;
}

/**
 * Extracts expiration metadata for telemetry JWT tokens.
 * @param {string} token
 * @returns {{ exp: number, expiresAt: string, isExpired: boolean, remainingDays: number }|null}
 */
export function getTokenExpirationInfo(token) {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return null;
  }
  const expMs = payload.exp * 1000;
  const remainingMs = expMs - Date.now();
  return {
    exp: payload.exp,
    expiresAt: new Date(expMs).toISOString(),
    isExpired: remainingMs <= 60000,
    remainingDays: Math.max(0, Math.round(remainingMs / (1000 * 60 * 60 * 24)))
  };
}

/**
 * Produces a non-sensitive masked preview of a JWT for admin status displays.
 * @param {string} token
 * @returns {string|null}
 */
export function maskToken(token) {
  if (!token || typeof token !== "string") return null;
  const trimmed = token.trim();
  if (trimmed.length <= 16) return "***";
  return `${trimmed.slice(0, 10)}...${trimmed.slice(-6)}`;
}
