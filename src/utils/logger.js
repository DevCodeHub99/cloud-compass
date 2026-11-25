/**
 * CloudCompass - Production Structured Logger
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4
};

function getInitialLogLevel() {
  const envLevel = import.meta.env?.VITE_LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    return LOG_LEVELS[envLevel];
  }
  return import.meta.env?.DEV ? LOG_LEVELS.debug : LOG_LEVELS.warn;
}

let currentLogLevel = getInitialLogLevel();
let globalTrackingInitialized = false;

export const logger = {
  setLevel(level) {
    if (level in LOG_LEVELS) {
      currentLogLevel = LOG_LEVELS[level];
    }
  },

  debug(message, ...args) {
    if (currentLogLevel <= LOG_LEVELS.debug) {
      console.debug(`[CloudCompass:DEBUG] ${message}`, ...args);
    }
  },

  info(message, ...args) {
    if (currentLogLevel <= LOG_LEVELS.info) {
      console.info(`[CloudCompass:INFO] ${message}`, ...args);
    }
  },

  warn(message, ...args) {
    if (currentLogLevel <= LOG_LEVELS.warn) {
      console.warn(`[CloudCompass:WARN] ${message}`, ...args);
    }
  },

  error(message, error, context = {}) {
    if (currentLogLevel <= LOG_LEVELS.error) {
      console.error(`[CloudCompass:ERROR] ${message}`, error, context);
    }
  }
};

export function captureException(error, context = {}) {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(message, error, context);
}

export function trackEvent(eventName, payload = {}) {
  logger.debug(`[Event: ${eventName}]`, payload);
}

export function initGlobalErrorTracking() {
  if (typeof window === "undefined" || globalTrackingInitialized) return;
  globalTrackingInitialized = true;

  window.addEventListener("error", (event) => {
    captureException(event.error || new Error(event.message), {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      type: "uncaught_exception"
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const error = reason instanceof Error ? reason : new Error(String(reason));
    captureException(error, { type: "unhandled_promise_rejection" });
  });

  logger.debug("Global error tracking hooks initialized.");
}

export default logger;
