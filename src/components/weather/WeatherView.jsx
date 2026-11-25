import { CurrentWeather } from "./CurrentWeather";
import { HourlyForecast } from "./HourlyForecast";
import { DailyForecast } from "./DailyForecast";
import { WeatherMetricsGrid } from "./WeatherMetricsGrid";
import { SunTimeline } from "./SunTimeline";
import { SectionCard } from "../common/SectionCard";

export function WeatherView({
  weatherData,
  theme = "light",
  onLocationClick,
  locationLoading = false
}) {
  if (!weatherData) return null;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* 1. Hero Atmospheric Observation */}
      <CurrentWeather
        weatherData={weatherData}
        theme={theme}
        onLocationClick={onLocationClick}
        locationLoading={locationLoading}
      />

      {/* 2. Compact 24-Hour Timeline with Temperature Curve & Solar Milestones */}
      <HourlyForecast
        hourly={weatherData.hourly}
        advisory={weatherData.advisory || weatherData.current?.advisory}
        astronomy={weatherData.astronomy}
        theme={theme}
      />

      {/* 3. Astronomical Sun Timeline & Real-Time Solar Position */}
      <SunTimeline
        astronomy={weatherData.astronomy}
        coord={weatherData.city?.coord}
        theme={theme}
      />

      {/* 4. 5-Day Outlook with Temperature Range Bars */}
      <DailyForecast
        daily={weatherData.daily}
        currentTemp={weatherData.current?.temp}
        theme={theme}
      />

      {/* 4. Deep Meteorological Insights Grid (UV, Wind, Dew Point, Pressure, Visibility, Clouds) */}
      <SectionCard as="section" theme={theme} className="content-visibility-auto">
        <div className="mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
          <h3 className={`text-base sm:text-lg font-black ${theme === "dark" ? "text-white" : "text-slate-900"}`}>
            Atmospheric Conditions & Metrics
          </h3>
          <p className={`text-xs ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
            UV index, wind gusts, humidity, pressure & visibility metrics
          </p>
        </div>
        <WeatherMetricsGrid weatherData={weatherData} theme={theme} />
      </SectionCard>
    </div>
  );
}

export default WeatherView;
