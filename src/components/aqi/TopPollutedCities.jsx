import React from "react";
import { Flame } from "lucide-react";
import { getCPCBBadge, getBadgeStyle } from "../../constants/aqiStandards";
import { SectionCard } from "../common/SectionCard";

export const TopPollutedCities = React.memo(function TopPollutedCities({
  cities = [],
  onSelectCity,
  theme = "light"
}) {
  const isDark = theme === "dark";

  if (!cities || cities.length === 0) return null;

  return (
    <SectionCard theme={theme} className="content-visibility-auto mt-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3
            className={`text-xl font-bold flex items-center space-x-2 ${
              isDark ? "text-white" : "text-slate-900"
            }`}
          >
            <Flame className="w-5 h-5 text-rose-500 shrink-0" />
            <span>Most Polluted Cities</span>
          </h3>
          <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Real-time pollution rankings across Indian cities
          </p>
        </div>
        <span
          className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0 border shadow-xs ${
            isDark
              ? "text-rose-300 bg-rose-950/60 border-rose-800"
              : "text-rose-700 bg-rose-50 border-rose-200"
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
          </span>
          <span>Live Rankings</span>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cities.map((item, idx) => {
          const aqiVal = item["AQI-IN"] ?? item.aqi ?? 0;
          const badge = getCPCBBadge(aqiVal);
          const rank = item.rank || idx + 1;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectCity && item.city && onSelectCity(item.city)}
              className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group shadow-xs hover:shadow-md active:scale-[0.98] ${
                isDark
                  ? "bg-slate-800/80 hover:bg-slate-800 border-slate-700/80 hover:border-rose-500/60 text-white"
                  : "bg-slate-50/80 hover:bg-white border-slate-200 hover:border-rose-300 text-slate-900"
              }`}
            >
              <div className="flex items-center space-x-3">
                <span
                  className={`w-6 h-6 rounded-full text-xs font-extrabold flex items-center justify-center transition-colors ${
                    isDark
                      ? "bg-slate-700 text-slate-300 group-hover:bg-rose-500 group-hover:text-white"
                      : "bg-slate-200 text-slate-700 group-hover:bg-rose-500 group-hover:text-white"
                  }`}
                >
                  {rank}
                </span>
                <div>
                  <p
                    className={`font-bold text-sm transition-colors ${
                      isDark
                        ? "text-white group-hover:text-rose-400"
                        : "text-slate-900 group-hover:text-rose-600"
                    }`}
                  >
                    {item.city}
                  </p>
                  <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {item.state || item.country}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span
                  className="inline-block text-xs font-extrabold px-2 py-0.5 rounded-md shadow-xs"
                  style={getBadgeStyle(badge)}
                >
                  {aqiVal}
                </span>
                <p className={`text-[10px] mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  PM2.5: {item.pm25 != null ? item.pm25 : "N/A"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
});

export default TopPollutedCities;
