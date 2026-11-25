import React from "react";
import {
  MapPin,
  Calendar,
  Radio,
  Navigation,
  Wind,
  Droplets,
  Gauge,
  SunMedium
} from "lucide-react";
import { getUVCategory, getWindDirection } from "../../utils/weatherUtils";
import { DEFAULT_WEATHER_ICON } from "../../constants/api";
import { SectionCard } from "../common/SectionCard";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatCityDate(offsetMinutes) {
  if (typeof offsetMinutes === "number" && Number.isFinite(offsetMinutes)) {
    const shifted = new Date(Date.now() + offsetMinutes * 60000);
    return `${WEEKDAYS[shifted.getUTCDay()]}, ${shifted.getUTCDate()} ${MONTHS[shifted.getUTCMonth()]} ${shifted.getUTCFullYear()}`;
  }
  return new Date().toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export const CurrentWeather = React.memo(function CurrentWeather({
  weatherData,
  theme = "light",
  onLocationClick,
  locationLoading = false
}) {
  const isDark = theme === "dark";
  if (!weatherData) return null;

  const { city, current, astronomy } = weatherData;
  const currentDate = formatCityDate(astronomy?.effectiveOffsetMinutes);

  const windKph = current.wind_kph ?? (current.windSpeed != null ? Math.round(current.windSpeed * 3.6) : 0);
  const windDir = current.wind_dir || getWindDirection(current.wind_degree);
  const uvVal = current.uv != null ? Number(current.uv) : 3;
  const uvInfo = getUVCategory(uvVal);

  const iconUrl = current.icon || DEFAULT_WEATHER_ICON;

  const quickStats = [
    { label: "Wind", icon: Wind, iconClass: "text-teal-500", value: `${windDir} ${windKph} km/h` },
    { label: "Humidity", icon: Droplets, iconClass: "text-cyan-500", value: `${current.humidity}%` },
    { label: "Pressure", icon: Gauge, iconClass: "text-indigo-500", value: `${current.pressure} hPa` },
    { label: "UV Index", icon: SunMedium, iconClass: "text-amber-500", value: `${uvVal} (${uvInfo.level})`, valueClass: uvInfo.color }
  ];

  return (
    <SectionCard theme={theme}>
      {/* Top Meta Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 pb-4 border-b border-slate-100 dark:border-slate-800/80">
        <div>
          <div className="flex items-center space-x-2">
            <MapPin className={`w-5 h-5 flex-shrink-0 ${isDark ? "text-teal-400" : "text-teal-600"}`} />
            <div className="flex items-baseline flex-wrap gap-x-2.5 gap-y-0.5">
              <h2 className={`text-xl sm:text-2xl font-black tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                {city.name}
              </h2>
              {city.secondary && (
                <span className={`text-xs sm:text-sm font-semibold tracking-wide ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {city.secondary}
                </span>
              )}
            </div>
            {onLocationClick && (
              <button
                type="button"
                onClick={onLocationClick}
                disabled={locationLoading}
                title="Detect exact coordinates via GPS"
                className={`inline-flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1.5 min-h-[36px] min-w-[36px] rounded-full border transition-all cursor-pointer ${
                  isDark
                    ? "bg-slate-800 border-slate-700 text-teal-400 hover:bg-slate-700"
                    : "bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100"
                }`}
              >
                <Navigation className={`w-3.5 h-3.5 ${locationLoading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Locate</span>
              </button>
            )}
          </div>
          <p className={`text-xs font-medium mt-1 flex items-center space-x-1.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            <Calendar className="w-3.5 h-3.5" />
            <span>{currentDate}</span>
          </p>
        </div>

        {/* Live Source Badge */}
        <div className="flex items-center space-x-2">
          {current.isPhysicalSensor ? (
            <span
              className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0 shadow-xs ${
                isDark
                  ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800"
                  : "bg-emerald-50 text-emerald-800 border border-emerald-200"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Ground Sensor</span>
            </span>
          ) : (
            <span
              className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0 shadow-xs ${
                isDark
                  ? "bg-slate-800/80 text-teal-300 border border-slate-700"
                  : "bg-teal-50 text-teal-800 border border-teal-200"
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-teal-500" />
              <span>Live Weather Feed</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Temperature & Weather Hero Row */}
      <div
        className={`p-4 sm:p-6 rounded-2xl mb-4 border transition-all ${
          isDark
            ? "bg-gradient-to-br from-slate-800/90 via-slate-800/60 to-slate-900/90 border-slate-700/80 text-white shadow-inner"
            : "bg-gradient-to-br from-teal-50/90 via-cyan-50/60 to-emerald-50/90 border-teal-200/70 text-slate-900 shadow-sm"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Temperature & Icon */}
          <div className="flex items-center space-x-4 sm:space-x-6">
            <img
              src={iconUrl}
              alt={current.condition || "Weather"}
              className="w-20 h-20 sm:w-24 sm:h-24 drop-shadow-md filter select-none"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = DEFAULT_WEATHER_ICON;
              }}
            />
            <div>
              <div className="flex items-start">
                <span className={`text-5xl sm:text-6xl font-black tracking-tight tabular-nums ${isDark ? "text-white" : "text-slate-900"}`}>
                  {current.temp}
                </span>
                <span className={`text-2xl sm:text-3xl font-extrabold mt-1 ${isDark ? "text-teal-400" : "text-teal-600"}`}>
                  &deg;C
                </span>
              </div>
              <p className={`text-sm sm:text-base font-semibold mt-0.5 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                Feels like {current.feels_like}&deg;C
              </p>
            </div>
          </div>

          {/* Condition Details & Diurnal Range */}
          <div className="text-center sm:text-right">
            <h3 className={`text-xl sm:text-2xl font-black capitalize [text-wrap:balance] ${isDark ? "text-white" : "text-slate-900"}`}>
              {current.condition}
            </h3>
            {current.description && current.description.toLowerCase() !== current.condition.toLowerCase() && (
              <p className={`text-xs sm:text-sm font-medium capitalize mt-0.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                {current.description}
              </p>
            )}
            <div className="mt-2 inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 shadow-xs">
              <span className="text-rose-500">H: {current.temp_max}&deg;C</span>
              <span className="text-slate-400">&bull;</span>
              <span className="text-sky-500">L: {current.temp_min}&deg;C</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Micro-Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        {quickStats.map(({ label, icon: Icon, iconClass, value, valueClass }) => (
          <div
            key={label}
            className={`p-2.5 sm:p-3 rounded-xl border flex items-center space-x-2.5 min-h-[58px] sm:min-h-[64px] ${
              isDark ? "bg-slate-800/60 border-slate-700/60" : "bg-slate-50 border-slate-200/70"
            }`}
          >
            <Icon className={`w-4 h-4 ${iconClass} flex-shrink-0`} />
            <div className="truncate">
              <p className={`text-[10px] font-semibold uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {label}
              </p>
              <p className={`font-bold truncate ${valueClass || (isDark ? "text-white" : "text-slate-900")}`}>
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
});

export default CurrentWeather;
