import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { Header } from "./components/common/Header";
import { SearchBar } from "./components/common/SearchBar";
import { Loader } from "./components/common/Loader";
import { Footer } from "./components/common/Footer";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useGeolocation } from "./hooks/useGeolocation";
import { normalizeAQIWeatherData } from "./services/weatherService";
import {
  fetchAQIBySlug,
  fetchAQIByCoords,
  fetchNearbyStations,
  fetchAQITrend,
  searchAQILocations,
  fetchTopPollutedCities
} from "./services/aqiService";
import { DEFAULT_LOCATION, STORAGE_KEYS } from "./constants/api";
import { formatLocationInfo } from "./constants/aqiStandards";
import { logger, trackEvent, captureException } from "./utils/logger";
import {
  getSavedLocation,
  saveLastLocation,
  detectApproximateLocation
} from "./services/locationDetection";
import { AlertCircle, X, Wind, Sun } from "lucide-react";

// Dynamic lazy imports for route-level code splitting & bundle optimization
const WeatherView = lazy(() => import("./components/weather/WeatherView"));
const AQIView = lazy(() => import("./components/aqi/AQIView"));
const TokenAdmin = lazy(() => import("./components/admin/TokenAdmin"));

function isFiniteCoord(val) {
  return val !== undefined && val !== null && val !== "" && Number.isFinite(Number(val));
}

function isTokenAdminRoute() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.replace(/\/+$/, "") === "/token";
}

export function App() {
  const [isAdminRoute] = useState(() => isTokenAdminRoute());

  const [theme, setTheme] = useLocalStorage(STORAGE_KEYS.THEME, () => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  });

  const [mode, setMode] = useLocalStorage(STORAGE_KEYS.APP_MODE, "weather");
  const [searchHistory, setSearchHistory] = useLocalStorage(STORAGE_KEYS.SEARCH_HISTORY, [
    "New Delhi",
    "Mumbai",
    "Bengaluru"
  ]);

  const [currentLocation, setCurrentLocation] = useState(() => {
    return getSavedLocation() || DEFAULT_LOCATION;
  });
  const [weatherData, setWeatherData] = useState(null);
  const [aqiData, setAqiData] = useState(null);
  const [trendRange, setTrendRange] = useState("24h");
  const [trendCache, setTrendCache] = useState({});
  const [trendLoading, setTrendLoading] = useState(false);
  const [activeTrendTarget, setActiveTrendTarget] = useState({ slug: null, fallbackSlug: null });
  const [nearbyStations, setNearbyStations] = useState([]);
  const [topCities, setTopCities] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Loading...");
  const [error, setError] = useState(null);

  // Monotonic sequence refs to prevent race conditions across location and chart timeframe switches
  const activeQueryIdRef = useRef(0);
  const activeTrendReqRef = useRef(0);
  const trendRangeRef = useRef(trendRange);
  trendRangeRef.current = trendRange;

  const { getPosition, loading: geoLoading } = useGeolocation();

  // Sync theme class on <html> and <body> without wiping base body classes
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.remove("light", "dark");
    root.classList.add(theme === "dark" ? "dark" : "light");
    body.classList.remove("light", "dark");
    body.classList.add(theme === "dark" ? "dark" : "light");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, [setTheme]);

  // Save unique city to search history (max 8)
  const recordSearchHistory = useCallback(
    (cityName) => {
      if (!cityName) return;
      setSearchHistory((prev) => {
        const filtered = prev.filter((item) => item.toLowerCase() !== cityName.toLowerCase());
        return [cityName, ...filtered].slice(0, 8);
      });
    },
    [setSearchHistory]
  );

  const handleClearHistory = useCallback(() => {
    setSearchHistory([]);
  }, [setSearchHistory]);

  const loadTrendForTarget = useCallback((primarySlug, fallbackSlug, queryId, explicitRange) => {
    const rangeToLoad = explicitRange || trendRangeRef.current;
    setActiveTrendTarget({ slug: primarySlug || null, fallbackSlug: fallbackSlug || null });
    setTrendCache({});

    if (!primarySlug) {
      setTrendLoading(false);
      return;
    }

    const trendReqId = ++activeTrendReqRef.current;
    setTrendLoading(true);
    fetchAQITrend(primarySlug, rangeToLoad, { fallbackSlug })
      .then((data) => {
        if (queryId === activeQueryIdRef.current && trendReqId === activeTrendReqRef.current) {
          setTrendCache({ [rangeToLoad]: data });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (queryId === activeQueryIdRef.current && trendReqId === activeTrendReqRef.current) {
          setTrendLoading(false);
        }
      });
  }, []);

  /**
   * Shared parallel secondary telemetry loader (trend, nearby stations, rankings)
   */
  const fetchSecondaryTelemetry = useCallback(
    (trendSlug, fallbackSlug, lat, lon, queryId, explicitRange) => {
      loadTrendForTarget(trendSlug, fallbackSlug, queryId, explicitRange);

      if (isFiniteCoord(lat) && isFiniteCoord(lon)) {
        fetchNearbyStations(Number(lat), Number(lon))
          .then((data) => {
            if (queryId === activeQueryIdRef.current) setNearbyStations(data);
          })
          .catch(() => {});
      }

      fetchTopPollutedCities(6)
        .then((data) => {
          if (queryId === activeQueryIdRef.current) setTopCities(data);
        })
        .catch(() => {});
    },
    [loadTrendForTarget]
  );

  const handleTrendRangeChange = useCallback(
    async (nextRange) => {
      setTrendRange(nextRange);
      if (!activeTrendTarget.slug || Object.prototype.hasOwnProperty.call(trendCache, nextRange)) {
        return;
      }

      const queryId = activeQueryIdRef.current;
      const trendReqId = ++activeTrendReqRef.current;
      setTrendLoading(true);
      try {
        const data = await fetchAQITrend(activeTrendTarget.slug, nextRange, {
          fallbackSlug: activeTrendTarget.fallbackSlug
        });
        if (queryId === activeQueryIdRef.current && trendReqId === activeTrendReqRef.current) {
          setTrendCache((prev) => ({ ...prev, [nextRange]: data }));
        }
      } catch {
        // Handled by empty-state fallback inside TrendChart
      } finally {
        if (queryId === activeQueryIdRef.current && trendReqId === activeTrendReqRef.current) {
          setTrendLoading(false);
        }
      }
    },
    [activeTrendTarget, trendCache]
  );

  const applyTelemetry = useCallback((info) => {
    setAqiData(info);
    if (info.weather) {
      setWeatherData(normalizeAQIWeatherData(info));
    }
  }, []);

  /**
   * Load AQI & Weather data for a given location or coordinates
   */
  const loadAQIData = useCallback(
    async (slug, lat, lon) => {
      const queryId = ++activeQueryIdRef.current;
      try {
        let aqiInfo = null;

        if (slug) {
          try {
            aqiInfo = await fetchAQIBySlug(slug);
          } catch {
            if (isFiniteCoord(lat) && isFiniteCoord(lon)) {
              aqiInfo = await fetchAQIByCoords(Number(lat), Number(lon));
            }
          }
        } else if (isFiniteCoord(lat) && isFiniteCoord(lon)) {
          aqiInfo = await fetchAQIByCoords(Number(lat), Number(lon));
        }

        if (queryId !== activeQueryIdRef.current || !aqiInfo) return;

        applyTelemetry(aqiInfo);
        const resolvedSlug = aqiInfo.location_slug || aqiInfo.slug || slug;
        const stationLat = isFiniteCoord(aqiInfo.latitude) ? Number(aqiInfo.latitude) : lat;
        const stationLon = isFiniteCoord(aqiInfo.longitude) ? Number(aqiInfo.longitude) : lon;
        fetchSecondaryTelemetry(resolvedSlug, aqiInfo.city_slug || null, stationLat, stationLon, queryId);
      } catch (err) {
        logger.warn("AQI data fetch warning:", err.message);
      }
    },
    [applyTelemetry, fetchSecondaryTelemetry]
  );

  /**
   * Fetch complete data for coordinates with closest physical sensor resolution
   */
  const loadDataByCoords = useCallback(
    async (lat, lon, { recordHistory = false } = {}) => {
      const queryId = ++activeQueryIdRef.current;
      setLoading(true);
      setError(null);
      setLoadingMessage("Pinpointing closest physical monitoring sensor...");

      try {
        const aqiClosest = await fetchAQIByCoords(lat, lon);
        if (queryId !== activeQueryIdRef.current) return;

        applyTelemetry(aqiClosest);

        const stationLat = isFiniteCoord(aqiClosest.latitude) ? Number(aqiClosest.latitude) : lat;
        const stationLon = isFiniteCoord(aqiClosest.longitude) ? Number(aqiClosest.longitude) : lon;
        const stationCity = formatLocationInfo(aqiClosest).title;
        const trendSlug = aqiClosest.location_slug || aqiClosest.slug;

        const newLoc = {
          city: stationCity,
          country: aqiClosest.country || "India",
          lat: stationLat,
          lon: stationLon,
          slug: trendSlug
        };
        setCurrentLocation(newLoc);
        saveLastLocation(newLoc);
        if (recordHistory) recordSearchHistory(stationCity);
        trackEvent("coords_located", { lat: stationLat, lon: stationLon, city: stationCity });

        fetchSecondaryTelemetry(trendSlug, aqiClosest.city_slug || null, stationLat, stationLon, queryId);
      } catch (err) {
        if (queryId === activeQueryIdRef.current) {
          captureException(err, { action: "loadDataByCoords", lat, lon });
          setError(err.message || "Failed to fetch data for current coordinates.");
        }
      } finally {
        if (queryId === activeQueryIdRef.current) {
          setLoading(false);
        }
      }
    },
    [applyTelemetry, fetchSecondaryTelemetry, recordSearchHistory]
  );

  /**
   * Fetch complete data for a city search query
   */
  const loadDataByCity = useCallback(
    async (cityName, specificSlug = null, { recordHistory = true } = {}) => {
      const queryId = ++activeQueryIdRef.current;
      setLoading(true);
      setError(null);
      setLoadingMessage(`Searching "${cityName}"...`);

      try {
        let slug = specificSlug;
        if (!slug) {
          const searchMatches = await searchAQILocations(cityName);
          if (queryId !== activeQueryIdRef.current) return;
          if (searchMatches?.[0]?.slug) {
            slug = searchMatches[0].slug;
          } else {
            throw new Error(`Location "${cityName}" not found.`);
          }
        }

        let aqiInfo = null;
        try {
          aqiInfo = await fetchAQIBySlug(slug);
        } catch {
          if (queryId !== activeQueryIdRef.current) return;
          const searchMatches = await searchAQILocations(cityName);
          if (queryId !== activeQueryIdRef.current) return;
          if (searchMatches?.[0]?.slug && searchMatches[0].slug !== slug) {
            slug = searchMatches[0].slug;
            aqiInfo = await fetchAQIBySlug(slug);
          } else {
            throw new Error(`Location "${cityName}" not found.`);
          }
        }

        if (queryId !== activeQueryIdRef.current) return;

        applyTelemetry(aqiInfo);

        const stationCity = formatLocationInfo(aqiInfo).title || cityName;
        const lat = isFiniteCoord(aqiInfo.latitude)
          ? Number(aqiInfo.latitude)
          : isFiniteCoord(aqiInfo.city_lat)
          ? Number(aqiInfo.city_lat)
          : null;
        const lon = isFiniteCoord(aqiInfo.longitude)
          ? Number(aqiInfo.longitude)
          : isFiniteCoord(aqiInfo.city_lon)
          ? Number(aqiInfo.city_lon)
          : null;

        const newLoc = {
          city: stationCity,
          country: aqiInfo.country || "India",
          lat,
          lon,
          slug
        };
        setCurrentLocation(newLoc);
        saveLastLocation(newLoc);
        if (recordHistory) recordSearchHistory(stationCity);
        trackEvent("city_searched", { city: stationCity, slug });

        const trendSlug = aqiInfo.location_slug || aqiInfo.slug || slug;
        fetchSecondaryTelemetry(trendSlug, aqiInfo.city_slug || null, lat, lon, queryId);
      } catch (err) {
        if (queryId === activeQueryIdRef.current) {
          captureException(err, { action: "loadDataByCity", cityName, specificSlug });
          setError(err.message || "Failed to fetch data for the requested city.");
        }
      } finally {
        if (queryId === activeQueryIdRef.current) {
          setLoading(false);
        }
      }
    },
    [applyTelemetry, fetchSecondaryTelemetry, recordSearchHistory]
  );

  /**
   * Handle station selection from nearby sensors list
   */
  const handleSelectStation = useCallback(
    async (stationOrSlug) => {
      if (!stationOrSlug) return;
      const targetSlug =
        typeof stationOrSlug === "string"
          ? stationOrSlug
          : stationOrSlug.location_slug || stationOrSlug.slug || stationOrSlug.station_slug;

      const queryId = ++activeQueryIdRef.current;

      if (typeof stationOrSlug === "object" && stationOrSlug.iaqi) {
        applyTelemetry(stationOrSlug);
      }

      if (!targetSlug) return;

      setLoading(true);
      setLoadingMessage("Loading sensor station telemetry...");
      try {
        const aqiInfo = await fetchAQIBySlug(targetSlug);
        if (queryId !== activeQueryIdRef.current) return;

        applyTelemetry(aqiInfo);
        const trendSlug = aqiInfo.location_slug || aqiInfo.slug || targetSlug;
        loadTrendForTarget(trendSlug, aqiInfo.city_slug || null, queryId);
        trackEvent("station_selected", { slug: targetSlug });
      } catch (err) {
        if (queryId === activeQueryIdRef.current) {
          captureException(err, { action: "handleSelectStation", targetSlug });
          if (typeof stationOrSlug !== "object" || !stationOrSlug.iaqi) {
            setError("Could not load station telemetry: " + err.message);
          }
        }
      } finally {
        if (queryId === activeQueryIdRef.current) {
          setLoading(false);
        }
      }
    },
    [applyTelemetry, loadTrendForTarget]
  );

  // Initial load: Query param (?q=...) -> Saved location -> Single deduplicated regional/GPS lookup
  useEffect(() => {
    if (isAdminRoute) return undefined;

    let isMounted = true;
    const urlQuery = new URLSearchParams(window.location.search).get("q")?.trim();
    if (urlQuery) {
      loadDataByCity(urlQuery, null, { recordHistory: true });
      return () => {
        isMounted = false;
      };
    }

    const saved = getSavedLocation();
    if (saved && (saved.city || (isFiniteCoord(saved.lat) && isFiniteCoord(saved.lon)))) {
      if (isFiniteCoord(saved.lat) && isFiniteCoord(saved.lon)) {
        loadDataByCoords(Number(saved.lat), Number(saved.lon), { recordHistory: false });
      } else {
        loadDataByCity(saved.city, saved.slug, { recordHistory: false });
      }
      return () => {
        isMounted = false;
      };
    }

    let gpsResolved = false;

    const approxPromise = detectApproximateLocation();
    approxPromise
      .then((approx) => {
        if (!isMounted || gpsResolved) return;
        if (isFiniteCoord(approx.lat) && isFiniteCoord(approx.lon)) {
          loadDataByCoords(Number(approx.lat), Number(approx.lon), { recordHistory: false });
        } else if (approx.city) {
          loadDataByCity(approx.city, approx.slug || null, { recordHistory: false });
        } else {
          loadDataByCity(DEFAULT_LOCATION.city, DEFAULT_LOCATION.slug, { recordHistory: false });
        }
      })
      .catch(() => {
        if (!isMounted || gpsResolved) return;
        loadDataByCity(DEFAULT_LOCATION.city, DEFAULT_LOCATION.slug, { recordHistory: false });
      });

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!isMounted) return;
          gpsResolved = true;
          loadDataByCoords(pos.coords.latitude, pos.coords.longitude, { recordHistory: false });
        },
        () => {
          // Approximate lookup promise is already in flight
        },
        { timeout: 6000, maximumAge: 300000 }
      );
    }

    return () => {
      isMounted = false;
    };
  }, [isAdminRoute, loadDataByCoords, loadDataByCity]);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    trackEvent("mode_switched", { mode: newMode });
    if (newMode === "aqi" && !aqiData && isFiniteCoord(currentLocation.lat) && isFiniteCoord(currentLocation.lon)) {
      loadAQIData(currentLocation.slug, currentLocation.lat, currentLocation.lon);
    }
  };

  const handleGeolocationClick = useCallback(async () => {
    try {
      const pos = await getPosition();
      loadDataByCoords(pos.lat, pos.lon, { recordHistory: true });
    } catch (err) {
      setError(err.message);
    }
  }, [getPosition, loadDataByCoords]);

  const userCoords = useMemo(
    () => ({ lat: currentLocation.lat, lon: currentLocation.lon }),
    [currentLocation.lat, currentLocation.lon]
  );

  const shellClass = `min-h-screen p-3 md:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] transition-colors duration-300 ${
    theme === "dark" ? "dark bg-slate-950/60 text-slate-100" : "light bg-transparent text-slate-900"
  }`;

  const headerClass = `p-3.5 sm:p-6 lg:p-7 shadow-xl rounded-3xl max-w-4xl mx-auto transition-all duration-300 border ${
    theme === "dark"
      ? "bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 border-slate-800 text-white shadow-2xl shadow-teal-950/40"
      : "bg-gradient-to-r from-teal-500 via-teal-600 to-cyan-600 border-teal-400/30 text-white shadow-xl shadow-teal-600/20"
  }`;

  if (isAdminRoute) {
    return (
      <div className={shellClass}>
        <header className={headerClass}>
          <Header theme={theme} onToggleTheme={toggleTheme} />
        </header>

        <Suspense fallback={<Loader message="Loading admin controls..." />}>
          <TokenAdmin theme={theme} />
        </Suspense>

        <Footer theme={theme} />
      </div>
    );
  }

  return (
    <div className={shellClass}>
      {/* Header Container */}
      <header className={headerClass}>
        <Header theme={theme} onToggleTheme={toggleTheme} />

        <SearchBar
          mode={mode}
          onSearch={loadDataByCity}
          onLocationClick={handleGeolocationClick}
          locationLoading={geoLoading}
          searchHistory={searchHistory}
          onClearHistory={handleClearHistory}
          theme={theme}
        />
      </header>

      {/* Modern Segmented View Mode Capsule Switcher */}
      <nav aria-label="View mode" className="max-w-md mx-auto my-5 px-2 select-none">
        <div
          className={`relative p-1 rounded-full border backdrop-blur-xl transition-all duration-300 flex items-center shadow-inner ${
            theme === "dark"
              ? "bg-slate-900/80 border-slate-800/80"
              : "bg-slate-200/70 border-slate-300/60"
          }`}
        >
          <div
            className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full transition-all duration-300 ease-out shadow-md pointer-events-none ${
              mode === "aqi" ? "left-1" : "left-[calc(50%+2px)]"
            } ${
              theme === "dark"
                ? "bg-slate-800 border border-slate-700/60 shadow-black/40"
                : "bg-white border border-slate-200/90 shadow-slate-300/70"
            }`}
          />

          <button
            type="button"
            onClick={() => handleModeChange("aqi")}
            aria-pressed={mode === "aqi"}
            className={`relative z-10 flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 min-h-[44px] rounded-full text-xs sm:text-sm font-black transition-colors duration-200 cursor-pointer outline-none select-none ${
              mode === "aqi"
                ? theme === "dark"
                  ? "text-white"
                  : "text-teal-950"
                : theme === "dark"
                ? "text-slate-400 hover:text-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Wind
              className={`w-4 h-4 flex-shrink-0 transition-colors ${
                mode === "aqi"
                  ? theme === "dark"
                    ? "text-teal-400"
                    : "text-teal-600"
                  : "text-slate-400"
              }`}
            />
            <span>Air Quality</span>
            {mode === "aqi" && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse hidden sm:inline-block ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleModeChange("weather")}
            aria-pressed={mode === "weather"}
            className={`relative z-10 flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 min-h-[44px] rounded-full text-xs sm:text-sm font-black transition-colors duration-200 cursor-pointer outline-none select-none ${
              mode === "weather"
                ? theme === "dark"
                  ? "text-white"
                  : "text-teal-950"
                : theme === "dark"
                ? "text-slate-400 hover:text-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Sun
              className={`w-4 h-4 flex-shrink-0 transition-colors ${
                mode === "weather"
                  ? "text-amber-500 fill-amber-500"
                  : "text-slate-400"
              }`}
            />
            <span>Weather</span>
            {mode === "weather" && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse hidden sm:inline-block ml-0.5" />
            )}
          </button>
        </div>
      </nav>

      {/* Dismissible Error Banner */}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 px-4 py-3 rounded-2xl max-w-4xl mx-auto mt-3 shadow-md text-sm animate-in fade-in duration-200"
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error notification"
            className="text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-200 p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="mt-4">
        {loading ? (
          <Loader message={loadingMessage} />
        ) : (
          <Suspense fallback={<Loader message="Loading environmental view..." />}>
            {mode === "weather" ? (
              <WeatherView
                weatherData={weatherData}
                theme={theme}
                onLocationClick={handleGeolocationClick}
                locationLoading={geoLoading}
              />
            ) : (
              <AQIView
                aqiData={aqiData}
                trendData={trendCache[trendRange] ?? null}
                trendRange={trendRange}
                trendLoading={trendLoading}
                onTrendRangeChange={handleTrendRangeChange}
                nearbyStations={nearbyStations}
                topCities={topCities}
                userCoords={userCoords}
                onSelectStation={handleSelectStation}
                onSelectCity={loadDataByCity}
                onLocationClick={handleGeolocationClick}
                locationLoading={geoLoading}
                theme={theme}
              />
            )}
          </Suspense>
        )}
      </main>

      <Footer theme={theme} />
    </div>
  );
}

export default App;
