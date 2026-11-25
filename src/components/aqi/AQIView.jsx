import { AQIHero } from "./AQIHero";
import { PollutantGrid } from "./PollutantGrid";
import { SensorWeather } from "./SensorWeather";
import { TrendChart } from "./TrendChart";
import { NearbyStations } from "./NearbyStations";
import { TopPollutedCities } from "./TopPollutedCities";
import { formatLocationInfo } from "../../constants/aqiStandards";

export function AQIView({
  aqiData,
  trendData,
  trendRange = "24h",
  trendLoading = false,
  onTrendRangeChange,
  nearbyStations,
  topCities,
  userCoords,
  onSelectStation,
  onSelectCity,
  onLocationClick,
  locationLoading,
  theme = "light"
}) {
  if (!aqiData) return null;

  const activeStationSlug = aqiData.location_slug || aqiData.slug;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <AQIHero
        aqiData={aqiData}
        onLocationClick={onLocationClick}
        locationLoading={locationLoading}
        theme={theme}
      />
      <PollutantGrid
        iaqi={{ ...aqiData, ...(aqiData.iaqi || {}) }}
        stationName={formatLocationInfo(aqiData).title}
        theme={theme}
      />
      <SensorWeather weather={aqiData.weather} theme={theme} />
      <TrendChart
        trendData={trendData}
        range={trendRange}
        loading={trendLoading}
        onRangeChange={onTrendRangeChange}
        theme={theme}
      />
      <NearbyStations
        stations={nearbyStations}
        activeStationSlug={activeStationSlug}
        userCoords={userCoords}
        onSelectStation={onSelectStation}
        theme={theme}
      />
      <TopPollutedCities cities={topCities} onSelectCity={onSelectCity} theme={theme} />
    </div>
  );
}

export default AQIView;
