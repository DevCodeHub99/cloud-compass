import React from "react";
import { POLLUTANT_SPECS } from "../../constants/aqiStandards";
import { Volume2, Wind, Flame } from "lucide-react";
import { SectionCard } from "../common/SectionCard";

const POLLUTANT_LEVELS = [
  {
    minRatio: 250,
    label: "Hazardous",
    border: "border-l-rose-600",
    bar: "bg-rose-600",
    darkBadge: "bg-rose-950/50 text-rose-300 border-rose-800",
    lightBadge: "bg-rose-50 text-rose-800 border-rose-200"
  },
  {
    minRatio: 150,
    label: "Very High",
    border: "border-l-purple-600",
    bar: "bg-rose-500",
    darkBadge: "bg-purple-950/50 text-purple-300 border-purple-800",
    lightBadge: "bg-purple-50 text-purple-800 border-purple-200"
  },
  {
    minRatio: 100,
    label: "Above Limit",
    border: "border-l-orange-500",
    bar: "bg-amber-500",
    darkBadge: "bg-orange-950/50 text-orange-300 border-orange-800",
    lightBadge: "bg-orange-50 text-orange-800 border-orange-200"
  },
  {
    minRatio: 70,
    label: "Moderate",
    border: "border-l-amber-500",
    bar: null,
    darkBadge: "bg-amber-950/50 text-amber-300 border-amber-800",
    lightBadge: "bg-amber-50 text-amber-800 border-amber-200"
  },
  {
    minRatio: -Infinity,
    label: "Safe",
    border: "border-l-emerald-500",
    bar: null,
    darkBadge: "bg-emerald-950/50 text-emerald-300 border-emerald-800",
    lightBadge: "bg-emerald-50 text-emerald-800 border-emerald-200"
  }
];

function getPollutantSeverity(ratio, isDark) {
  const tier = POLLUTANT_LEVELS.find((item) => ratio > item.minRatio) || POLLUTANT_LEVELS[4];
  return {
    statusLabel: tier.label,
    borderAccent: tier.border,
    badgeColor: isDark ? tier.darkBadge : tier.lightBadge,
    barColor: tier.bar || (isDark ? "bg-teal-400" : "bg-emerald-500")
  };
}

function ParticulateCloudIcon({ label, colorClass, dashArray, radius, isDark, className }) {
  return (
    <div className={`relative ${className} shrink-0 flex items-center justify-center ${colorClass}`}>
      <svg viewBox="0 0 40 40" className="w-full h-full fill-none stroke-current stroke-2">
        <path d="M28 28H14a7 7 0 0 1-1.3-13.8A8 8 0 0 1 27.5 13 6 6 0 0 1 28 28z" strokeDasharray={dashArray} opacity="0.6" />
        <circle cx="16" cy="20" r={radius} fill="currentColor" />
        <circle cx="21" cy="18" r={radius} fill="currentColor" />
        <circle cx="24" cy="23" r={radius} fill="currentColor" />
        <circle cx="17" cy="24" r={radius} fill="currentColor" />
      </svg>
      <span className={`absolute bottom-0.5 font-mono text-[7px] sm:text-[8px] font-bold tracking-tighter ${isDark ? "text-white" : "text-slate-800"}`}>
        {label}
      </span>
    </div>
  );
}

function PollutantIcon({ type, label, isDark, className = "w-7 h-7 sm:w-9 sm:h-9" }) {
  if (label === "PM2.5" || label === "PM10") {
    const isFine = label === "PM2.5";
    return (
      <ParticulateCloudIcon
        label={label}
        colorClass={
          isFine
            ? isDark ? "text-teal-400" : "text-teal-600"
            : isDark ? "text-purple-400" : "text-purple-600"
        }
        dashArray={isFine ? "2 2" : "3 2"}
        radius={isFine ? "1.5" : "2"}
        isDark={isDark}
        className={className}
      />
    );
  }

  if (type === "chemical" || label === "TVOC") {
    return (
      <div className={`${className} shrink-0 flex items-center justify-center ${isDark ? "text-amber-400" : "text-amber-600"}`}>
        <svg viewBox="0 0 40 40" className="w-full h-full fill-none stroke-current stroke-2">
          <path d="M20 6l12 7v14l-12 7-12-7V13z" />
          <circle cx="20" cy="20" r="5" strokeDasharray="3 2" />
          <circle cx="20" cy="6" r="2" fill="currentColor" />
          <circle cx="32" cy="13" r="2" fill="currentColor" />
          <circle cx="32" cy="27" r="2" fill="currentColor" />
          <circle cx="20" cy="34" r="2" fill="currentColor" />
          <circle cx="8" cy="27" r="2" fill="currentColor" />
          <circle cx="8" cy="13" r="2" fill="currentColor" />
        </svg>
      </div>
    );
  }

  if (type === "acoustic" || label === "NOISE") {
    return (
      <div className={`${className} shrink-0 flex items-center justify-center ${isDark ? "text-orange-400" : "text-orange-600"}`}>
        <Volume2 className="w-full h-full" />
      </div>
    );
  }

  if (label === "CO") {
    return (
      <div className={`${className} shrink-0 flex items-center justify-center ${isDark ? "text-rose-400" : "text-rose-600"}`}>
        <Flame className="w-full h-full" />
      </div>
    );
  }

  return (
    <div className={`${className} shrink-0 flex items-center justify-center ${isDark ? "text-cyan-400" : "text-cyan-600"}`}>
      <Wind className="w-full h-full" />
    </div>
  );
}

function formatPollutantValue(key, numVal) {
  if (key === "tvoc") return numVal % 1 !== 0 ? numVal.toFixed(2) : String(numVal);
  if (key === "noise" || (numVal < 10 && numVal % 1 !== 0)) return numVal.toFixed(1);
  return String(Math.round(numVal));
}

export const PollutantGrid = React.memo(function PollutantGrid({ iaqi = {}, stationName = "", theme = "light" }) {
  const isDark = theme === "dark";

  const monitoredKeys = Object.keys(POLLUTANT_SPECS).filter(
    (key) => iaqi[key] !== undefined && iaqi[key] !== null && !isNaN(Number(iaqi[key]))
  );

  if (monitoredKeys.length === 0) return null;

  return (
    <SectionCard theme={theme} className="mt-4">
      <div
        className={`flex items-center justify-between pb-3 sm:pb-5 border-b gap-2 ${
          isDark ? "border-slate-800" : "border-slate-100"
        }`}
      >
        <div className="min-w-0 flex-1">
          <h3
            className={`text-lg sm:text-2xl font-black tracking-tight truncate ${
              isDark ? "text-white" : "text-slate-900"
            }`}
          >
            Major Air Pollutants
          </h3>
          {stationName && (
            <p className={`text-xs sm:text-sm font-semibold mt-0.5 truncate ${isDark ? "text-teal-400" : "text-teal-700"}`}>
              {stationName}
            </p>
          )}
        </div>

        <span
          className={`inline-flex items-center space-x-1.5 text-[11px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full border shadow-xs whitespace-nowrap shrink-0 ${
            isDark
              ? "text-teal-300 bg-teal-950/60 border-teal-800/80"
              : "text-teal-800 bg-teal-50 border-teal-200"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
          <span>{monitoredKeys.length} Pollutants</span>
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5 mt-3 sm:mt-5">
        {monitoredKeys.map((key) => {
          const spec = POLLUTANT_SPECS[key];
          const numVal = Number(iaqi[key]);
          const ratio = (numVal / spec.safeThreshold) * 100;
          const percentage = Math.min(Math.round(ratio), 100);
          const { statusLabel, borderAccent, badgeColor, barColor } = getPollutantSeverity(ratio, isDark);

          return (
            <div
              key={key}
              className={`relative transition-all duration-300 p-2.5 sm:p-3.5 rounded-2xl border border-l-4 ${borderAccent} flex flex-col justify-between group shadow-xs hover:-translate-y-0.5 hover:shadow-md ${
                isDark
                  ? "bg-slate-800/80 hover:bg-slate-800 border-slate-700/80 text-white"
                  : "bg-white hover:bg-slate-50 border-slate-200 text-slate-900 shadow-slate-200/50"
              }`}
            >
              <div className="flex items-center justify-between gap-1.5 mb-2 sm:mb-2.5">
                <PollutantIcon type={spec.type} label={spec.label} isDark={isDark} />
                <span
                  className={`px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wider border shrink-0 ${badgeColor}`}
                >
                  {statusLabel}
                </span>
              </div>

              <div className="mb-2 sm:mb-2.5">
                <div className="flex items-baseline gap-1">
                  <span className={`text-xl sm:text-2xl font-black tracking-tight tabular-nums ${isDark ? "text-white" : "text-slate-900"}`}>
                    {formatPollutantValue(key, numVal)}
                  </span>
                  <span className={`text-[10px] sm:text-xs font-mono font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {spec.unit}
                  </span>
                </div>

                <div className="mt-0.5">
                  <h4
                    className={`text-xs sm:text-sm font-extrabold leading-tight truncate ${isDark ? "text-slate-100" : "text-slate-900"}`}
                    title={spec.fullName}
                  >
                    <span className="sm:hidden">{spec.label}</span>
                    <span className="hidden sm:inline">{spec.fullName}</span>
                  </h4>
                  <p className={`text-[10px] sm:text-[11px] font-medium leading-tight truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {spec.shortName}
                  </p>
                </div>
              </div>

              <div className={`pt-2 border-t ${isDark ? "border-slate-700/60" : "border-slate-100"}`}>
                <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-semibold mb-1">
                  {ratio > 100 ? (
                    <span className={`font-bold font-mono ${isDark ? "text-rose-400" : "text-rose-600"}`}>
                      {(numVal / spec.safeThreshold).toFixed(1)}x Limit
                    </span>
                  ) : (
                    <span className={`font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Safe: &le; {spec.safeThreshold}
                    </span>
                  )}
                  <span className={`font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {percentage}%
                  </span>
                </div>

                <div className={`w-full h-1 sm:h-1.5 rounded-full overflow-hidden ${isDark ? "bg-slate-700/60" : "bg-slate-100"}`}>
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
});

export default PollutantGrid;
