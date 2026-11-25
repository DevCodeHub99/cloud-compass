import crypto from "node:crypto";
import {
  getTokenStoreStatus,
  setActiveToken,
  clearActiveToken
} from "./_tokenStore.js";

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest();
}

function verifyAdminSecret(provided, expected) {
  if (!provided || !expected) return false;
  return crypto.timingSafeEqual(sha256(provided), sha256(expected));
}

function parseJsonBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    return JSON.parse(body);
  }
  if (typeof body === "object") {
    return body;
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  const expectedSecret = process.env.ADMIN_SECRET;
  if (!expectedSecret) {
    return res.status(503).json({
      error: "Admin token management is disabled: ADMIN_SECRET is not configured on the server."
    });
  }

  const providedSecret = req.headers["x-admin-secret"];
  if (typeof providedSecret !== "string" || !verifyAdminSecret(providedSecret, expectedSecret)) {
    return res.status(401).json({
      error: "Invalid or missing admin secret."
    });
  }

  if (req.method === "GET") {
    const status = await getTokenStoreStatus();
    return res.status(200).json(status);
  }

  if (req.method === "POST") {
    let payload;
    try {
      payload = parseJsonBody(req.body);
    } catch {
      return res.status(400).json({ error: "Malformed JSON request body." });
    }

    try {
      const status = await setActiveToken(payload?.token);
      return res.status(200).json({
        message: "Global AQI telemetry token updated successfully.",
        ...status
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        error: err.message || "Failed to update telemetry token."
      });
    }
  }

  if (req.method === "DELETE") {
    const status = await clearActiveToken();
    return res.status(200).json({
      message: "Stored runtime token cleared.",
      ...status
    });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed." });
}
