# CloudCompass | Real-Time Weather & Air Quality Platform

[![Live Demo](https://img.shields.io/badge/Demo-cloudcompass99.vercel.app-000000?logo=vercel&logoColor=white)](https://cloudcompass99.vercel.app/)
[![CI](https://github.com/DevCodeHub99/cloud-compass/actions/workflows/ci.yml/badge.svg)](https://github.com/DevCodeHub99/cloud-compass/actions/workflows/ci.yml)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](https://opensource.org/licenses/MIT)

**CloudCompass** is an environmental intelligence application built with **React 18**, **Vite**, and **Tailwind CSS**. It provides real-time ground-level air quality telemetry and meteorological forecasts powered by a single, unified physical sensor network ([AQI.in](https://www.aqi.in)).

🔗 **Live Application**: [https://cloudcompass99.vercel.app/](https://cloudcompass99.vercel.app/)

---

## Architecture & System Overview

```mermaid
flowchart TD
    subgraph Client["Browser Client (React 18 SPA)"]
        User["User Entry / Mount"]
        LocEngine["Progressive Location Engine"]
        Search["Accessible WAI-ARIA SearchBar"]
        ModeCtrl["Segmented Mode Capsule"]
        
        subgraph Views["Dynamic Route-Split Views (React.lazy)"]
            AQI["AQIView (Pollutants, 24h Trend, Nearby Stations)"]
            Weather["WeatherView (Diurnal Temp, SunTimeline, 5-Day Outlook)"]
        end
    end

    subgraph LocationResolution["Multi-Tier Location Discovery"]
        Edge["Tier 1: Vercel Edge CDN Headers (/api/geo)"]
        ClientIP["Tier 2: Public Client IP Geolocation (freeipapi / ipwho.is)"]
        Timezone["Tier 3: Browser IANA Timezone Heuristic (0ms, Offline)"]
        Storage["Tier 4: LocalStorage Session Memory (cloudcompass_last_location)"]
        GPS["Tier 5: High-Precision Browser GPS Upgrade"]
    end

    subgraph DataPipeline["Telemetry Ingestion & Mathematics"]
        API["AQI.in Telemetry Cluster"]
        Solar["NOAA Solar Celestial Engine (Timezone-Aware)"]
        DewPoint["Magnus-Tetens Atmospheric Math"]
        Standards["CPCB & US EPA Dual Standards"]
    end

    User --> LocEngine
    LocEngine --> Storage & Edge & ClientIP & Timezone
    LocEngine -. If Permitted .-> GPS
    Search --> LocEngine
    
    LocEngine --> API
    API --> Solar & DewPoint & Standards
    Solar & DewPoint & Standards --> ModeCtrl
    
    ModeCtrl -->|Mode = 'weather'| Weather
    ModeCtrl -->|Mode = 'aqi'| AQI
```

---

## Core Capabilities

### 1. Multi-Tier Progressive Location Discovery
- **Zero-Setup Regional Discovery**: Automatically determines the visitor's city and geographic coordinates on first load without demanding invasive permissions or defaulting to a hardcoded city.
- **Vercel Edge Integration ([`api/geo.js`](file:///api/geo.js))**: Reads `x-vercel-ip-city` and coordinates directly from connection headers at edge edge points with 0ms third-party latency.
- **Client IP & IANA Timezone Heuristic**: Falls back to CORS IP endpoints (`freeipapi.com`, `ipwho.is`) and browser timezone extraction (`Intl.DateTimeFormat`) for 100% offline coverage.
- **Smooth GPS Upgrade**: Prompts for device GPS in the background. When approved, seamlessly refines coordinates from broad city centers to the closest neighborhood physical sensor.
- **Session Memory**: Caches the active location to `localStorage` (`cloudcompass_last_location`) for instantaneous sub-millisecond restoration on subsequent visits.

### 2. Dual Environmental Operational Modes
- **Weather Forecast Mode**:
  - Live observation, diurnal high/low projections, feels-like temperature, and atmospheric advisory.
  - Continuous 24-hour temperature curve with solar rise and set markers.
  - **NOAA Solar Celestial Engine**: High-precision calculation of dawn, sunrise, solar noon, sunset, dusk, daylight duration, and real-time sun elevation trajectory, formatted according to target longitude timezone offsets.
  - 5-day outlook with horizontal temperature distribution range bars.
  - 6-card meteorological grid: UV index, Wind & Gusts, Humidity & Dew Point, Barometric Pressure, Visibility, and Cloud Cover.
- **Air Quality (AQI) Mode**:
  - Live dual-standard comparison between **Indian CPCB** (0–500) and **US EPA** scales.
  - Interactive 24-hour pollution histogram with frame-synced 60fps pointer scrubbing (`requestAnimationFrame`).
  - Active pollutant cards with status accents (PM2.5, PM10, TVOC, CO, Noise).
  - Nearest physical sensor discovery with Haversine distance calculation.
  - Real-time polluted cities leaderboard.

### 3. Production Performance & Optimization
- **Route-Level Code Splitting**: View containers (`WeatherView`, `AQIView`) are dynamically loaded via `React.lazy` and wrapped in `<Suspense>`.
- **Vendor Chunking**: External libraries (`react`, `react-dom`, `lucide-react`) are isolated into immutable Rollup vendor chunks for aggressive edge caching.
- **Micro-Bundle Footprint**: Initial application entry is reduced to **~17 kB** gzipped; total compressed JavaScript is **~80 kB** gzipped across all modules.
- **Component Memoization**: All leaf presentation components are wrapped in `React.memo` to eliminate unnecessary re-renders during state transitions.

### 4. Accessibility (a11y) & UX Standards
- **WAI-ARIA Combobox Search**: Full keyboard navigation (`ArrowDown`, `ArrowUp`, `Enter`, `Escape`) across autocomplete suggestions and search history.
- **Screen Reader Readiness**: Clear `aria-label`, `role="listbox"`, `role="option"`, and `aria-activedescendant` bindings across input controls and clear buttons.
- **FOUC Prevention**: Inline pre-hydration script in [`index.html`](file:///index.html) ensures zero Flash of Unstyled Content on theme hydration.

---

## Quick Start

### Prerequisites
- Node.js `18.x` or higher
- npm `9.x` or higher

### Installation
```bash
# 1. Clone repository
git clone https://github.com/DevCodeHub99/Weather-Forecast-Application.git
cd Weather-Forecast-Application

# 2. Install dependencies
npm install

# 3. Configure local admin secret for /token endpoint
cp .env.example .env.local
# Edit .env.local and set ADMIN_SECRET=...

# 4. Start development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment & Remote Token Administration

CloudCompass proxies all `aqi.in` telemetry through [`api/aqi.js`](file:///api/aqi.js) so no Bearer JWT is exposed in browser bundles or `localStorage`.

- **Hidden Admin Route (`/token`)**: Visit `/token` (e.g., `http://localhost:3000/token` or `https://your-app.vercel.app/token`) and unlock with `ADMIN_SECRET` to inspect token expiry and remotely rotate the global `aqi.in` Bearer token without redeploying the frontend.
- **Persistent Global Storage on Vercel**: Configure **MongoDB Atlas** (`MONGODB_URI`, plus optional `MONGODB_DB`) in Vercel Environment Variables once alongside `ADMIN_SECRET` so updates via `/token` persist globally across all serverless instances.

| Variable | Scope | Description |
| :--- | :--- | :--- |
| `ADMIN_SECRET` | Server (`api/token.js`) | Required secret passphrase protecting `/api/token` |
| `MONGODB_URI` / `MONGODB_DB` | Server (`api/_tokenStore.js`) | MongoDB Atlas connection string (and optional DB override, default `cloudcompass`) for persistent global `/token` updates |
| `AQI_TOKEN` | Server (`api/aqi.js`) | Optional initial fallback AQI.in Bearer token |
| `AQI_API_BASE` | Server (`api/aqi.js`) | Optional upstream endpoint override (default: `https://apiserver.aqi.in`) |
| `VITE_LOG_LEVEL` | Client | Minimum logging threshold: `debug` \| `info` \| `warn` \| `error` \| `none` |

---

## Build Diagnostics & Bundle Distribution

```text
vite v6.4.6 building for production...
✓ 1606 modules transformed.
dist/index.html                        8.03 kB │ gzip:  2.71 kB
dist/assets/bg-img-D-nDYq9F.avif      64.50 kB
dist/assets/index-DN9aImng.css        60.49 kB │ gzip: 10.04 kB
dist/assets/icons-C-QR6h7-.js         22.79 kB │ gzip:  6.11 kB
dist/assets/WeatherView-CKKvyVTD.js   42.14 kB │ gzip:  9.40 kB
dist/assets/AQIView-BufGZgas.js       43.74 kB │ gzip:  9.77 kB
dist/assets/index-CwLqAQ0d.js         49.96 kB │ gzip: 17.46 kB
dist/assets/vendor-CbbLAKBo.js       134.66 kB │ gzip: 43.22 kB
✓ built in 5.44s
```

---

## Directory Tree

```
Weather-Forecast-Application/
├── .env.example                 # Standardized environment template
├── .gitignore                   # Git exclusion rules
├── index.html                   # HTML entrypoint
├── package.json                 # Project dependencies and npm scripts
├── postcss.config.js            # PostCSS configuration
├── public/
│   └── theme-init.js            # CSP-safe pre-hydration theme bootstrap
├── tailwind.config.js           # Tailwind theme and dark-mode setup
├── vercel.json                  # Edge routing, CSP/HSTS headers & caching
├── vite.config.js               # Bundler configuration & local /api middleware
├── api/
│   ├── _tokenStore.js           # MongoDB Atlas / local file / env token store
│   ├── aqi.js                   # Server-side allowlisted AQI.in proxy
│   ├── geo.js                   # Vercel Edge CDN IP geolocation handler
│   └── token.js                 # Admin-protected /api/token rotation handler
└── src/
    ├── main.jsx                 # App root with ErrorBoundary wrapper
    ├── App.jsx                  # State orchestration, /token routing & mode sync
    ├── index.css                # Global dual-theme styling & scrollbar hiding
    ├── img/
    │   └── bg-img.avif          # Optimized atmospheric backdrop image
    ├── constants/
    │   ├── api.js               # Endpoints, defaults & storage keys
    │   └── aqiStandards.js      # CPCB / US EPA bands, thresholds & formatting
    ├── utils/
    │   ├── jwt.js               # Shared JWT claim parsing & expiry checks
    │   ├── logger.js            # Production structured logger & global error hooks
    │   ├── solarCalculator.js   # NOAA astronomical sunrise, sunset & solar elevation
    │   └── weatherUtils.js      # Dew point, UV scale, wind direction & comfort math
    ├── services/
    │   ├── aqiService.js        # /api/aqi client, 24H/7D/30D trends & geo math
    │   ├── weatherService.js    # Telemetry normalization & meteorological forecast
    │   └── locationDetection.js # Multi-tier Edge/IP/Timezone progressive location discovery
    ├── hooks/
    │   ├── useGeolocation.js    # Browser GPS hook with descriptive error codes
    │   └── useLocalStorage.js   # Persistent storage hook with in-memory fallback
    └── components/
        ├── admin/
        │   └── TokenAdmin.jsx   # Hidden /token remote token rotation portal
        ├── common/
        │   ├── Header.jsx       # Branding & circular morphing theme toggle
        │   ├── SectionCard.jsx  # Shared themed telemetry card surface
        │   ├── SearchBar.jsx    # Accessible WAI-ARIA location search & history
        │   ├── Footer.jsx       # Responsive footer with attribution
        │   ├── Loader.jsx       # Adaptive dark/light telemetry loader
        │   └── ErrorBoundary.jsx# Fallback UI preventing white-screen crashes
        ├── aqi/
        │   ├── AQIView.jsx      # Lazy-loaded AQI mode container
        │   ├── AQIHero.jsx      # Master AQI card, spectrum slider & micro-weather
        │   ├── PollutantGrid.jsx# Active pollutant cards with status accents
        │   ├── TrendChart.jsx   # Interactive 24H / 7D / 30D pollution histogram
        │   ├── NearbyStations.jsx# Closest physical monitoring stations list
        │   ├── SensorWeather.jsx# On-site meteorological observations
        │   └── TopPollutedCities.jsx # Live polluted cities leaderboard
        └── weather/
            ├── WeatherView.jsx        # Lazy-loaded Weather mode container
            ├── CurrentWeather.jsx     # Current observation & diurnal temperature
            ├── HourlyForecast.jsx     # 24-hour timeline with solar markers
            ├── SunTimeline.jsx        # Solar trajectory with real-time sun position
            ├── DailyForecast.jsx      # 5-day forecast with temperature range bars
            └── WeatherMetricsGrid.jsx # 6-card meteorological intelligence grid
```

---

## Observability & Error Tracking

CloudCompass uses [`src/utils/logger.js`](file:///src/utils/logger.js) for level-filtered structured logging (`VITE_LOG_LEVEL`) alongside global `error` and `unhandledrejection` capture.

---

## Architectural Principles

- **Single Source of Truth**: 100% of telemetry originates from physical sensors through `aqi.in`.
- **KISS & YAGNI**: Clean React 18 state management without external store bloat (~17 kB gzipped core bundle).
- **DRY Design**: Reusable hooks (`useLocalStorage`, `useGeolocation`), centralized mathematical utilities (`solarCalculator`, `weatherUtils`), and modular components.
- **Robust Error Handling**: Non-blocking `try/catch` fallbacks, request timeout abortion (`AbortController`), and user-facing error boundaries.
- **Repository Hygiene**: Version control remains free of build outputs (`dist/`), temporary scripts, or local secret files.

---

## License

This project is open-source and distributed under the MIT License.
