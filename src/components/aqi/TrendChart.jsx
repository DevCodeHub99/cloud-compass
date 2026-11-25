import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  BarChart3,
  ArrowDownRight,
  ArrowUpRight,
  Activity,
  Clock,
  Info,
  Loader2
} from "lucide-react";
import {
  getCPCBBadge,
  getBadgeStyle,
  formatAQITimestamp,
  parseServerTimestamp,
  CPCB_BANDS
} from "../../constants/aqiStandards";
import { SectionCard } from "../common/SectionCard";

const RANGE_META = {
  "24h": {
    id: "24h",
    label: "24H",
    title: "24-Hour Air Quality Trend",
    subtitle: "Hourly air quality history and 24-hour pollution pattern"
  },
  "7d": {
    id: "7d",
    label: "7D",
    title: "7-Day Air Quality Trend",
    subtitle: "Multi-day pollution progression over the past 7 days"
  },
  "30d": {
    id: "30d",
    label: "30D",
    title: "30-Day Air Quality Trend",
    subtitle: "Daily average air quality history across the past 30 days"
  }
};

const RANGE_OPTIONS = [RANGE_META["24h"], RANGE_META["7d"], RANGE_META["30d"]];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatTrendPointTime(dateStr, range) {
  if (!dateStr) return "Historical Reading";
  if (range === "24h") {
    return formatAQITimestamp(dateStr).time;
  }
  const d = parseServerTimestamp(dateStr);
  if (!d) return String(dateStr);

  const day = d.getDate();
  const month = SHORT_MONTHS[d.getMonth()];
  const year = d.getFullYear();

  if (range === "30d") {
    return `${day} ${month} ${year} (Daily Avg)`;
  }

  let hrs = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hrs >= 12 ? "PM" : "AM";
  hrs = hrs % 12 || 12;
  return `${day} ${month}, ${hrs}:${mins} ${ampm}`;
}

function formatAxisMilestone(dateStr, range) {
  const d = parseServerTimestamp(dateStr);
  if (!d) return "";
  if (range === "24h") {
    let hrs = d.getHours();
    const ampm = hrs >= 12 ? "PM" : "AM";
    hrs = hrs % 12 || 12;
    return `${hrs} ${ampm}`;
  }
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

function buildXAxisLabels(times, range) {
  if (range === "24h") {
    return {
      aligned: false,
      labels: ["24h Ago", "18h Ago", "12h Ago", "6h Ago", "Now"]
    };
  }
  if (!Array.isArray(times) || times.length === 0) {
    return {
      aligned: false,
      labels:
        range === "7d"
          ? ["7d Ago", "5d Ago", "3d Ago", "1d Ago", "Latest"]
          : ["30d Ago", "22d Ago", "15d Ago", "7d Ago", "Latest"]
    };
  }

  // When sparse (<= 10 points), align one date label directly beneath each bar
  if (times.length <= 10) {
    return {
      aligned: true,
      labels: times.map((t) => formatAxisMilestone(t, range) || "")
    };
  }

  const last = times.length - 1;
  const indices = [
    0,
    Math.round(last * 0.25),
    Math.round(last * 0.5),
    Math.round(last * 0.75),
    last
  ];
  return {
    aligned: false,
    labels: indices.map((idx) => formatAxisMilestone(times[idx], range) || "")
  };
}

export const TrendChart = React.memo(function TrendChart({
  trendData,
  range = "24h",
  loading = false,
  onRangeChange,
  theme = "light"
}) {
  const isDark = theme === "dark";
  const [hoverIndex, setHoverIndex] = useState(null);
  const containerRef = useRef(null);
  const rafIdRef = useRef(null);

  const values = trendData?.averageArray || [];
  const count = values.length;
  const meta = RANGE_META[range] || RANGE_META["24h"];

  useEffect(() => {
    setHoverIndex(null);
  }, [range, trendData]);

  // Touch & pointer scrub navigation - with requestAnimationFrame throttling
  const handlePointerScrub = useCallback(
    (clientX) => {
      if (!containerRef.current || count === 0) return;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width <= 0) return;
        const relativeX = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const ratio = relativeX / rect.width;
        const closestIdx = Math.floor(ratio * count);
        setHoverIndex(Math.max(0, Math.min(count - 1, closestIdx)));
      });
    },
    [count]
  );

  const clearHover = useCallback(() => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    setHoverIndex(null);
  }, []);

  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // Hide card completely only when initial 24h view has nothing and no loading/switch happened
  if (!loading && count === 0 && range === "24h" && !onRangeChange) {
    return null;
  }

  const times = trendData?.timeArray || [];
  const minVal = count > 0 ? (trendData?.minValue ?? Math.min(...values)) : 0;
  const maxVal = count > 0 ? (trendData?.maxValue ?? Math.max(...values)) : 0;
  const avgVal =
    count > 0
      ? (trendData?.avgValue ?? Math.round(values.reduce((a, b) => a + b, 0) / values.length))
      : 0;

  // SVG Coordinate Canvas Geometry
  const svgWidth = 800;
  const svgHeight = 220;
  const padX = 18;
  const padYTop = 34;
  const padYBottom = 30;

  const chartW = svgWidth - padX * 2;
  const chartH = svgHeight - padYTop - padYBottom;
  const baselineY = svgHeight - padYBottom;

  const scaleMax = Math.max(100, Math.ceil((maxVal * 1.15) / 50) * 50);
  const colW = count > 0 ? chartW / count : chartW;
  const maxBarW = count <= 10 ? 52 : count <= 20 ? 36 : 26;
  const barW = Math.max(4, Math.min(maxBarW, colW * 0.72));

  const bars = values.map((val, idx) => {
    const numVal = Number.isFinite(Number(val)) ? Number(val) : 0;
    const centerX = padX + idx * colW + colW / 2;
    const x = centerX - barW / 2;
    const height = Math.max(6, (numVal / scaleMax) * chartH);
    const y = baselineY - height;
    const timeFormatted = formatTrendPointTime(times[idx], range);
    const badge = getCPCBBadge(numVal);
    return {
      idx,
      x,
      y,
      width: barW,
      height,
      centerX,
      val: numVal,
      time: timeFormatted,
      badge
    };
  });

  const isInteracting = hoverIndex !== null && hoverIndex < bars.length;
  const activeIndex = isInteracting ? hoverIndex : bars.length - 1;
  const activeBar = bars[activeIndex] || null;
  const activeBadge = activeBar ? activeBar.badge : getCPCBBadge(0);

  const handleTouchMove = (e) => {
    if (e.touches && e.touches.length > 0) {
      handlePointerScrub(e.touches[0].clientX);
    }
  };

  const handleMouseMove = (e) => {
    handlePointerScrub(e.clientX);
  };

  const gridSteps = 4;
  const gridLines = Array.from({ length: gridSteps }, (_, i) => {
    const stepVal = Math.round((scaleMax / gridSteps) * (i + 1));
    const y = baselineY - (stepVal / scaleMax) * chartH;
    return { val: stepVal, y };
  });

  const tooltipLeftPct = activeBar
    ? Math.max(6, Math.min(94, (activeBar.centerX / svgWidth) * 100))
    : 50;
  const tooltipTopPct = activeBar
    ? Math.max(14, (activeBar.y / svgHeight) * 100)
    : 14;

  const xAxisLabels = buildXAxisLabels(times, range);

  return (
    <SectionCard theme={theme} className="content-visibility-auto">
      {/* Header bar: Title, Timeframe Switcher (24H / 7D / 30D) and Min/Avg/Max badges */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3
            className={`text-base sm:text-lg font-black tracking-tight flex items-center space-x-2 ${
              isDark ? "text-white" : "text-slate-900"
            }`}
          >
            <BarChart3 className={`w-4 h-4 ${isDark ? "text-teal-400" : "text-teal-600"}`} />
            <span>{meta.title}</span>
          </h3>
          <p className={`text-xs mt-0.5 flex flex-wrap items-center gap-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            <span>{meta.subtitle}</span>
            {trendData?.isCityFallback && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  isDark
                    ? "bg-slate-800 border-slate-700 text-teal-300"
                    : "bg-teal-50 border-teal-200 text-teal-700"
                }`}
              >
                City-wide History
              </span>
            )}
            {!loading && count > 0 && range === "30d" && count < 20 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  isDark
                    ? "bg-slate-800 border-slate-700 text-amber-300"
                    : "bg-amber-50 border-amber-200 text-amber-800"
                }`}
              >
                {count} Days Recorded
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between md:justify-end gap-2">
          {/* Segmented Timeframe Selector */}
          {onRangeChange && (
            <div
              role="group"
              aria-label="Historical AQI timeframe"
              className={`inline-flex p-0.5 rounded-xl border text-xs shadow-xs ${
                isDark ? "bg-slate-800/90 border-slate-700" : "bg-slate-100 border-slate-200"
              }`}
            >
              {RANGE_OPTIONS.map((opt) => {
                const active = range === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onRangeChange(opt.id)}
                    aria-pressed={active}
                    className={`px-2.5 sm:px-3 py-1 min-h-[34px] rounded-lg font-bold transition-all text-xs cursor-pointer select-none ${
                      active
                        ? "bg-teal-700 text-white shadow-xs font-black"
                        : isDark
                        ? "text-slate-400 hover:text-white hover:bg-slate-700/50"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Compact Min / Avg / Max statistics chips */}
          {count > 0 && (
            <div className="flex items-center space-x-1.5 text-xs">
              <div
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-xl font-bold border transition-colors ${
                  isDark
                    ? "bg-slate-800/80 border-slate-700/80 text-emerald-400"
                    : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }`}
              >
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span>Min: {minVal}</span>
              </div>

              <div
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-xl font-bold border transition-colors ${
                  isDark
                    ? "bg-teal-950/60 border-teal-800/80 text-teal-300"
                    : "bg-teal-50 border-teal-200 text-teal-800"
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Avg: {avgVal}</span>
              </div>

              <div
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-xl font-bold border transition-colors ${
                  isDark
                    ? "bg-rose-950/60 border-rose-800/80 text-rose-300"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Max: {maxVal}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="h-52 flex flex-col items-center justify-center space-y-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
          <span>Loading {meta.label} historical telemetry...</span>
        </div>
      ) : count === 0 ? (
        <div className="h-44 flex items-center justify-center text-xs font-medium text-slate-500 dark:text-slate-400">
          Historical {meta.label} trend data is unavailable for this monitoring station.
        </div>
      ) : (
        <>
          {/* Interactive Telemetry Readout Strip */}
          {activeBar && (
            <div
              className={`flex items-center justify-between text-xs px-3.5 py-2.5 rounded-2xl border mb-3 transition-all ${
                isInteracting
                  ? isDark
                    ? "bg-slate-800/90 border-teal-500/50 shadow-sm"
                    : "bg-teal-50/90 border-teal-300 shadow-xs"
                  : isDark
                  ? "bg-slate-800/50 border-slate-800"
                  : "bg-slate-50 border-slate-200/70"
              }`}
            >
              <div className="flex items-center space-x-2">
                <Clock className={`w-3.5 h-3.5 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
                <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  {isInteracting
                    ? `Selected: ${activeBar.time}`
                    : `Latest Reading: ${activeBar.time}`}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <span className={`text-sm font-black ${isDark ? "text-white" : "text-slate-900"}`}>
                  AQI: {activeBar.val}
                </span>
                <span
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-black shadow-xs transition-colors"
                  style={getBadgeStyle(activeBadge)}
                >
                  {activeBadge.category}
                </span>
              </div>
            </div>
          )}

          {/* Full-Bleed Touch & Mouse Responsive Bar Graph Canvas */}
          <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={clearHover}
            onTouchStart={handleTouchMove}
            onTouchMove={handleTouchMove}
            onTouchEnd={clearHover}
            className="relative w-full cursor-pointer select-none touch-none py-1"
            style={{ touchAction: "none" }}
          >
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-44 sm:h-52 overflow-visible"
              preserveAspectRatio="none"
            >
              {/* Horizontal Reference Grid Guidelines */}
              {gridLines.map((line, idx) => (
                <g key={idx} className="pointer-events-none opacity-40">
                  <line
                    x1={padX}
                    y1={line.y}
                    x2={svgWidth - padX}
                    y2={line.y}
                    stroke={isDark ? "#475569" : "#cbd5e1"}
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={svgWidth - padX + 2}
                    y={line.y + 3}
                    textAnchor="start"
                    fontSize="9"
                    fontWeight="600"
                    fill={isDark ? "#64748b" : "#94a3b8"}
                  >
                    {line.val}
                  </text>
                </g>
              ))}

              {/* Baseline Axis */}
              <line
                x1={padX}
                y1={baselineY}
                x2={svgWidth - padX}
                y2={baselineY}
                stroke={isDark ? "#334155" : "#e2e8f0"}
                strokeWidth="1"
              />

              {/* Render All Vertical Bars */}
              {bars.map((bar) => {
                const isSelected = activeIndex === bar.idx;
                const barOpacity =
                  hoverIndex !== null
                    ? isSelected
                      ? 1.0
                      : 0.35
                    : bar.idx === count - 1
                    ? 1.0
                    : 0.85;

                return (
                  <g
                    key={bar.idx}
                    className="transition-opacity duration-150"
                    onMouseEnter={() => setHoverIndex(bar.idx)}
                    onClick={() => setHoverIndex((prev) => (prev === bar.idx ? null : bar.idx))}
                  >
                    <rect
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      rx={Math.min(3, bar.width / 2)}
                      ry={Math.min(3, bar.width / 2)}
                      fill={bar.badge.color}
                      opacity={barOpacity}
                      stroke={isSelected ? (isDark ? "#ffffff" : "#0f172a") : "none"}
                      strokeWidth={isSelected ? 1.5 : 0}
                      className="transition-all duration-150"
                    />

                    <rect
                      x={padX + bar.idx * colW}
                      y={padYTop - 10}
                      width={colW}
                      height={chartH + 20}
                      fill="transparent"
                    />
                  </g>
                );
              })}

              {/* Active Vertical Indicator Line */}
              {activeBar && (
                <line
                  x1={activeBar.centerX}
                  y1={activeBar.y}
                  x2={activeBar.centerX}
                  y2={baselineY}
                  stroke={activeBadge.color}
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                  opacity="0.8"
                  className="pointer-events-none"
                />
              )}
            </svg>

            {/* Floating Responsive HTML Tooltip Pill */}
            {activeBar && (
              <div
                className="absolute pointer-events-none transition-all duration-75 ease-out z-20 flex flex-col items-center"
                style={{
                  left: `${Math.max(6, Math.min(94, tooltipLeftPct))}%`,
                  top: `calc(${tooltipTopPct}% - 6px)`,
                  transform: "translate(-50%, -100%)"
                }}
              >
                <div
                  className="px-2.5 py-0.5 rounded-lg text-xs font-black shadow-lg flex items-center justify-center tracking-tight border border-white/20 select-none whitespace-nowrap"
                  style={getBadgeStyle(activeBadge)}
                >
                  <span>{activeBar.val}</span>
                </div>
                <div
                  className="w-0 h-0 border-x-4 border-x-transparent border-t-[5px]"
                  style={{ borderTopColor: activeBadge.color }}
                />
              </div>
            )}
          </div>

          {/* Dynamic X-Axis Milestone Timeline Labels */}
          <div
            className={`${
              xAxisLabels.aligned ? "grid text-center" : "flex justify-between"
            } text-[10px] sm:text-xs font-mono font-semibold mt-1 px-1.5 ${
              isDark ? "text-slate-400" : "text-slate-500"
            }`}
            style={
              xAxisLabels.aligned
                ? { gridTemplateColumns: `repeat(${xAxisLabels.labels.length}, minmax(0, 1fr))` }
                : undefined
            }
          >
            {xAxisLabels.labels.map((label, idx) => {
              const isLast = idx === xAxisLabels.labels.length - 1;
              return (
                <span
                  key={idx}
                  className={isLast ? (isDark ? "text-teal-300 font-bold" : "text-teal-700 font-bold") : undefined}
                >
                  {label}
                </span>
              );
            })}
          </div>
        </>
      )}

      {/* CPCB Air Quality Index Color Category Legend */}
      <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 flex items-center space-x-1">
          <Info className="w-3 h-3" />
          <span>Legend:</span>
        </span>
        {CPCB_BANDS.map((band) => (
          <div key={band.category} className="flex items-center space-x-1">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-xs"
              style={{ backgroundColor: band.color }}
            />
            <span className="whitespace-nowrap">{band.category}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
});

export default TrendChart;
