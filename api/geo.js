export default function handler(req, res) {
  const city = req.headers["x-vercel-ip-city"] || null;
  const country = req.headers["x-vercel-ip-country"] || null;
  const lat = req.headers["x-vercel-ip-latitude"] || null;
  const lon = req.headers["x-vercel-ip-longitude"] || null;

  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.setHeader("Content-Type", "application/json");

  let decodedCity = null;
  if (city) {
    try {
      decodedCity = decodeURIComponent(city);
    } catch {
      decodedCity = city;
    }
  }

  res.status(200).json({
    city: decodedCity,
    country,
    lat: lat ? parseFloat(lat) : null,
    lon: lon ? parseFloat(lon) : null,
    source: "vercel-edge"
  });
}
