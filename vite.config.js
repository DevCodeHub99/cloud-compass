import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import geoHandler from "./api/geo.js";
import aqiHandler from "./api/aqi.js";
import tokenHandler from "./api/token.js";

const MAX_BODY_BYTES = 16 * 1024;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    req.on("error", reject);
  });
}

function attachVercelCompat(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json");
    }
    res.end(JSON.stringify(data));
    return res;
  };
}

function localApiMiddleware(mode) {
  const prevInjected = globalThis.__cloudcompassLoadedEnv || {};
  for (const key of Object.keys(prevInjected)) {
    if (process.env[key] === prevInjected[key]) {
      delete process.env[key];
    }
  }

  const env = loadEnv(mode, process.cwd(), "");
  const nextInjected = {};
  for (const [key, val] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = val;
      nextInjected[key] = val;
    }
  }
  globalThis.__cloudcompassLoadedEnv = nextInjected;

  const routes = new Map([
    ["/api/geo", geoHandler],
    ["/api/aqi", aqiHandler],
    ["/api/token", tokenHandler]
  ]);

  return async (req, res, next) => {
    const reqUrl = new URL(req.url || "/", "http://localhost");
    const handler = routes.get(reqUrl.pathname);
    if (!handler) {
      next();
      return;
    }

    attachVercelCompat(res);
    req.query = Object.fromEntries(reqUrl.searchParams.entries());
    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      try {
        req.body = await readJsonBody(req);
      } catch {
        res.status(413).json({ error: "Request body too large." });
        return;
      }
    }

    try {
      await handler(req, res);
    } catch (err) {
      if (!res.writableEnded) {
        res.status(500).json({ error: err?.message || "Internal server error" });
      }
    }
  };
}

function cloudcompassApiPlugin(mode) {
  return {
    name: "cloudcompass-local-api",
    configureServer(server) {
      server.middlewares.use(localApiMiddleware(mode));
    },
    configurePreviewServer(server) {
      server.middlewares.use(localApiMiddleware(mode));
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), cloudcompassApiPlugin(mode)],
  server: {
    host: true,
    port: 3000,
    open: false
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          icons: ["lucide-react"]
        }
      }
    }
  }
}));
