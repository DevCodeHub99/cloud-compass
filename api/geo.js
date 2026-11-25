function parseCoord(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

export default function handler(req, res) {
  const city = req.headers["x-vercel-ip-city"] || null;
  const country = req.headers["x-vercel-ip-country"] || null;
  const lat = req.headers["x-vercel-ip-latitude"] || null;
  const lon = req.headers["x-vercel-ip-longitude"] || null;

  // Never publicly cache per-visitor IP headers across Edge PoP users
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", "application/json");

  let decodedCity = null;
  if (city) {
    try {
      decodedCity = decodeURIComponent(city);
    } catch {
      decodedCity = city;
    }
  }

  return res.status(200).json({
    city: decodedCity,
    country,
    lat: parseCoord(lat),
    lon: parseCoord(lon),
    source: "vercel-edge"
  });
}
