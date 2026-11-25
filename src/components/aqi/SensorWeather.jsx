import React from "react";
import { Thermometer, Droplets, Wind, Gauge, Eye, SunMedium, CloudSun } from "lucide-react";
import { SectionCard } from "../common/SectionCard";

export const SensorWeather = React.memo(function SensorWeather({ weather = {}, theme = "light" }) {
  const isDark = theme === "dark";

  if (!weather || (!weather.temp_c && weather.temp_c !== 0)) return null;

  const tiles = [
    {
      label: "Temp",
      icon: Thermometer,
      iconClass: "text-emerald-600",
      value: `${weather.temp_c}°C`,
      sub: weather.feelslike_c != null ? `Feels: ${weather.feelslike_c}°C` : null
    },
    {
      label: "Humidity",
      icon: Droplets,
      iconClass: "text-cyan-600",
      value: `${weather.humidity ?? "N/A"}%`
    },
    {
      label: "Wind",
      icon: Wind,
      iconClass: "text-teal-600",
      value: `${weather.wind_kph ?? "0"} kph`,
      sub: weather.wind_dir ? `Dir: ${weather.wind_dir}` : null
    },
    {
      label: "Pressure",
      icon: Gauge,
      iconClass: "text-indigo-600",
      value: `${weather.pressure_mb ?? "N/A"} mb`
    },
    {
      label: "Visibility",
      icon: Eye,
      iconClass: "text-amber-600",
      value: `${weather.vis_km ?? "N/A"} km`
    },
    {
      label: "UV Index",
      icon: SunMedium,
      iconClass: "text-amber-500",
      value: `${weather.uv ?? "0"}${weather.uv_condition?.text ? ` (${weather.uv_condition.text})` : ""}`
    }
  ];

  return (
    <SectionCard id="weather-details" theme={theme} className="mt-4 scroll-mt-6">
      <div className="flex items-center justify-between gap-3 mb-3.5 sm:mb-4">
        <h3 className={`text-lg sm:text-xl font-bold flex items-center space-x-2 ${isDark ? "text-white" : "text-slate-900"}`}>
          <CloudSun className={`w-5 h-5 shrink-0 ${isDark ? "text-teal-400" : "text-teal-600"}`} />
          <span>Weather Conditions</span>
        </h3>
        {weather.condition?.text && (
          <div
            className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0 border shadow-xs ${
              isDark ? "bg-slate-800 text-slate-200 border-slate-700" : "bg-slate-100 text-slate-800 border-slate-200"
            }`}
          >
            {weather.condition?.icon && (
              <img
                src={weather.condition.icon}
                alt={weather.condition.text}
                className="w-4 h-4 object-contain inline-block shrink-0"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <span className="leading-none">{weather.condition.text}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 text-sm">
        {tiles.map(({ label, icon: Icon, iconClass, value, sub }) => (
          <div
            key={label}
            className={`p-2.5 sm:p-3 rounded-2xl border flex flex-col justify-between min-h-[76px] sm:min-h-[88px] ${
              isDark ? "bg-slate-800/80 border-slate-700" : "bg-slate-50 border-slate-200/80"
            }`}
          >
            <div className={`flex items-center space-x-1.5 text-xs font-semibold mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              <Icon className={`w-4 h-4 ${iconClass}`} />
              <span>{label}</span>
            </div>
            <div>
              <p className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{value}</p>
              {sub && <p className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>{sub}</p>}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
});

export default SensorWeather;
