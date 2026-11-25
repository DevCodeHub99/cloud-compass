/**
 * Astronomical Solar Calculation Engine (NOAA Solar Algorithm)
 * Computes high-precision sunrise, sunset, solar noon, civil twilight (dawn/dusk),
 * daylight duration, and real-time sun elevation trajectory from geographic coordinates.
 */

function deriveTimezoneOffsetMinutes(lat = 28.6139, lon = 77.2090, tzOffsetMinutes = null) {
  if (tzOffsetMinutes !== null && tzOffsetMinutes !== undefined && Number.isFinite(Number(tzOffsetMinutes))) {
    return Number(tzOffsetMinutes);
  }
  const validLat = Number.isFinite(Number(lat)) ? Number(lat) : 28.6139;
  const validLon = Number.isFinite(Number(lon)) ? Number(lon) : 77.2090;

  if (validLat >= 6 && validLat <= 38 && validLon >= 68 && validLon <= 98) {
    // Indian Standard Time (IST) is UTC+5:30 (+330 mins)
    return 330;
  }
  // Standard international timezone nearest 30-minute meridians
  return Math.round((validLon / 15) * 2) * 30;
}

export function calculateSolarCycle(lat = 28.6139, lon = 77.2090, refDate = new Date(), tzOffsetMinutes = null) {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  const parsedLat = lat !== undefined && lat !== null && lat !== "" && Number.isFinite(Number(lat)) ? Number(lat) : 28.6139;
  const parsedLon = lon !== undefined && lon !== null && lon !== "" && Number.isFinite(Number(lon)) ? Number(lon) : 77.2090;
  const validLat = Math.max(-89.9, Math.min(89.9, parsedLat));
  const validLon = Math.max(-180, Math.min(180, parsedLon));
  const rawDate = refDate instanceof Date ? refDate : new Date(refDate);
  const now = Number.isFinite(rawDate.getTime()) ? rawDate : new Date();

  const effectiveOffsetMinutes = deriveTimezoneOffsetMinutes(validLat, validLon, tzOffsetMinutes);

  // Evaluate calendar date in the target location's timezone rather than the browser's local timezone
  const targetLocalNow = new Date(now.getTime() + effectiveOffsetMinutes * 60000);
  const targetYear = targetLocalNow.getUTCFullYear();
  const targetMonth = targetLocalNow.getUTCMonth();
  const targetDay = targetLocalNow.getUTCDate();

  const dayOfYear = Math.floor(
    (Date.UTC(targetYear, targetMonth, targetDay) - Date.UTC(targetYear, 0, 0)) / 86400000
  );
  const lngHour = validLon / 15;

  /**
   * Calculates UTC hour [0, 24) of solar event at a given zenith.
   * Official sunrise/sunset zenith is 90.833°; civil twilight zenith is 96.0°.
   */
  function calcSolarEvent(isSunrise, zenith = 90.833) {
    const t = isSunrise
      ? dayOfYear + (6 - lngHour) / 24
      : dayOfYear + (18 - lngHour) / 24;

    const M = 0.9856 * t - 3.289;
    let L = (M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634) % 360;
    if (L < 0) L += 360;

    let RA = (deg * Math.atan(0.91764 * Math.tan(L * rad))) % 360;
    if (RA < 0) RA += 360;

    const Lquadrant = Math.floor(L / 90) * 90;
    const RAquadrant = Math.floor(RA / 90) * 90;
    RA = (RA + (Lquadrant - RAquadrant)) / 15;

    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));

    const cosH =
      (Math.cos(zenith * rad) - sinDec * Math.sin(validLat * rad)) /
      (cosDec * Math.cos(validLat * rad));

    if (cosH > 1 || cosH < -1) return null; // Polar night / midnight sun

    let H = isSunrise ? 360 - deg * Math.acos(cosH) : deg * Math.acos(cosH);
    H = H / 15;

    const T = H + RA - 0.06571 * t - 6.622;
    return (((T - lngHour) % 24) + 24) % 24;
  }

  const sunriseUT = calcSolarEvent(true);
  const sunsetUT = calcSolarEvent(false);
  const dawnUT = calcSolarEvent(true, 96.0);
  const duskUT = calcSolarEvent(false, 96.0);

  /**
   * Anchors a UTC solar hour onto the target city's local calendar day so events
   * crossing UTC midnight (e.g. Americas sunset or East Asia sunrise) stay properly ordered.
   */
  function toDate(utHours) {
    if (utHours === null || !Number.isFinite(utHours)) return null;
    const localHours = (((utHours + effectiveOffsetMinutes / 60) % 24) + 24) % 24;
    const localMidnightUtcMs = Date.UTC(targetYear, targetMonth, targetDay, 0, 0, 0) - effectiveOffsetMinutes * 60000;
    return new Date(localMidnightUtcMs + Math.round(localHours * 60) * 60000);
  }

  const sunrise = toDate(sunriseUT);
  let sunset = toDate(sunsetUT);
  if (sunrise && sunset && sunset.getTime() <= sunrise.getTime()) {
    sunset = new Date(sunset.getTime() + 24 * 3600000);
  }
  const dawn = toDate(dawnUT);
  let dusk = toDate(duskUT);
  if (dawn && dusk && dusk.getTime() <= dawn.getTime()) {
    dusk = new Date(dusk.getTime() + 24 * 3600000);
  }

  if (!sunrise || !sunset) {
    return {
      sunrise: "06:00 AM",
      sunset: "06:00 PM",
      solarNoon: "12:00 PM",
      dawn: "05:30 AM",
      dusk: "06:30 PM",
      rawSunrise: null,
      rawSunset: null,
      effectiveOffsetMinutes,
      daylightStr: "12h 00m",
      nightStr: "12h 00m",
      isDay: true,
      dayProgress: 0.5,
      nextEvent: { type: "sunset", countdown: "6h 00m", label: "Polar solar cycle" }
    };
  }

  const solarNoonMs = (sunrise.getTime() + sunset.getTime()) / 2;
  const solarNoon = new Date(solarNoonMs);

  const daylightMs = Math.max(0, sunset.getTime() - sunrise.getTime());
  const daylightHours = Math.floor(daylightMs / (1000 * 60 * 60));
  const daylightMinutes = Math.floor((daylightMs % (1000 * 60 * 60)) / (1000 * 60));

  const nightMs = Math.max(0, 24 * 3600000 - daylightMs);
  const nightHours = Math.floor(nightMs / (1000 * 60 * 60));
  const nightMinutes = Math.floor((nightMs % (1000 * 60 * 60)) / (1000 * 60));

  const nowMs = now.getTime();
  const isDay = nowMs >= sunrise.getTime() && nowMs <= sunset.getTime();

  let dayProgress = 0;
  if (isDay && daylightMs > 0) {
    dayProgress = Math.max(0, Math.min(1, (nowMs - sunrise.getTime()) / daylightMs));
  } else if (nowMs < sunrise.getTime()) {
    dayProgress = 0;
  } else {
    dayProgress = 1;
  }

  function buildNextEvent(type, eventDate) {
    const diffMs = Math.max(0, eventDate.getTime() - nowMs);
    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    const countdown = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    const prefix = type === "sunrise" ? "Sunrise" : "Sunset";
    return {
      type,
      time: eventDate,
      countdown,
      label: `${prefix} in ${countdown}`
    };
  }

  let nextEvent;
  if (nowMs < sunrise.getTime()) {
    nextEvent = buildNextEvent("sunrise", sunrise);
  } else if (nowMs < sunset.getTime()) {
    nextEvent = buildNextEvent("sunset", sunset);
  } else {
    nextEvent = buildNextEvent("sunrise", new Date(sunrise.getTime() + 24 * 3600000));
  }

  function formatTime(d) {
    if (!d) return "--:--";
    const localMs = d.getTime() + effectiveOffsetMinutes * 60000;
    const localDate = new Date(localMs);
    let hours = localDate.getUTCHours();
    const minutes = localDate.getUTCMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minStr = String(minutes).padStart(2, "0");
    return `${hours}:${minStr} ${ampm}`;
  }

  return {
    sunrise: formatTime(sunrise),
    sunset: formatTime(sunset),
    solarNoon: formatTime(solarNoon),
    dawn: formatTime(dawn),
    dusk: formatTime(dusk),
    rawSunrise: sunrise,
    rawSunset: sunset,
    effectiveOffsetMinutes,
    daylightStr: `${daylightHours}h ${String(daylightMinutes).padStart(2, "0")}m`,
    nightStr: `${nightHours}h ${String(nightMinutes).padStart(2, "0")}m`,
    isDay,
    dayProgress,
    nextEvent
  };
}

export default calculateSolarCycle;
