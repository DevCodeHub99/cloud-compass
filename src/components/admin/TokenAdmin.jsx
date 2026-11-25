import { useState, useEffect, useRef } from "react";
import {
  KeyRound,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  ArrowLeft,
  Lock
} from "lucide-react";
import { TOKEN_ADMIN_ENDPOINT } from "../../constants/api";
import { parseJwtPayload, getTokenExpirationInfo } from "../../utils/jwt";

export function TokenAdmin({ theme = "light" }) {
  const isDark = theme === "dark";
  const [adminSecret, setAdminSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [secretError, setSecretError] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);

  const [statusData, setStatusData] = useState(null);
  const [newToken, setNewToken] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', message }
  const [busy, setBusy] = useState(false);

  const secretInputRef = useRef(null);
  const tokenInputRef = useRef(null);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Token Administration | CloudCompass";

    const robotsMeta = document.querySelector('meta[name="robots"]');
    const prevRobots = robotsMeta?.getAttribute("content") || "";
    if (robotsMeta) {
      robotsMeta.setAttribute("content", "noindex, nofollow");
    }

    return () => {
      document.title = prevTitle;
      if (robotsMeta && prevRobots) {
        robotsMeta.setAttribute("content", prevRobots);
      }
    };
  }, []);

  const parsedPreview = (() => {
    const cleaned = newToken.trim().replace(/^Bearer\s+/i, "");
    if (!cleaned) return null;
    const payload = parseJwtPayload(cleaned);
    if (!payload) return { valid: false };
    const info = getTokenExpirationInfo(cleaned);
    return {
      valid: true,
      payload,
      info
    };
  })();

  const fetchStatus = async (secretValue) => {
    const res = await fetch(TOKEN_ADMIN_ENDPOINT, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-admin-secret": secretValue
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  };

  const handleUnlock = async (e) => {
    e.preventDefault();
    setFeedback(null);
    if (!adminSecret.trim()) {
      setSecretError("Enter the server ADMIN_SECRET to unlock.");
      secretInputRef.current?.focus();
      return;
    }

    setBusy(true);
    try {
      const data = await fetchStatus(adminSecret.trim());
      setStatusData(data);
      setIsUnlocked(true);
      setSecretError("");
    } catch (err) {
      setIsUnlocked(false);
      setSecretError(err.message);
      secretInputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!adminSecret.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const data = await fetchStatus(adminSecret.trim());
      setStatusData(data);
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleRotateToken = async (e) => {
    e.preventDefault();
    setFeedback(null);

    const trimmed = newToken.trim().replace(/^Bearer\s+/i, "");
    if (!trimmed) {
      setTokenError("Paste a valid AQI.in Bearer JWT token.");
      tokenInputRef.current?.focus();
      return;
    }
    if (!parsedPreview || !parsedPreview.valid) {
      setTokenError("Token must be a valid three-part JWT (header.payload.signature).");
      tokenInputRef.current?.focus();
      return;
    }
    if (parsedPreview.info?.isExpired) {
      setTokenError("This JWT is already expired or within 60 seconds of expiry.");
      tokenInputRef.current?.focus();
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(TOKEN_ADMIN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-admin-secret": adminSecret.trim()
        },
        body: JSON.stringify({ token: trimmed })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to update token (${res.status})`);
      }
      setStatusData(data);
      setNewToken("");
      setTokenError("");
      setFeedback({
        type: "success",
        message: "Global telemetry token updated. End users will use the new token immediately."
      });
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleClearToken = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(TOKEN_ADMIN_ENDPOINT, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          "x-admin-secret": adminSecret.trim()
        }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to clear token (${res.status})`);
      }
      setStatusData(data);
      setFeedback({
        type: "success",
        message: "Runtime token cleared (falling back to environment configuration if set)."
      });
    } catch (err) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const cardClass = isDark
    ? "bg-slate-900/95 border-slate-800 text-white shadow-2xl"
    : "bg-white border-slate-200 text-slate-900 shadow-xl";

  const inputClass = `w-full rounded-xl border px-3.5 py-2.5 min-h-[48px] text-sm transition-colors ${
    isDark
      ? "bg-slate-800 border-slate-700 text-white placeholder-slate-400"
      : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400"
  }`;

  return (
    <main className="max-w-xl mx-auto my-6 px-2">
      <div className={`rounded-3xl border p-5 sm:p-7 backdrop-blur-xl space-y-5 ${cardClass}`}>
        <div className="flex items-center justify-between gap-3 border-b pb-4 border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-500">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black tracking-tight">
                Global Token Administration
              </h1>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Rotate the server-side AQI.in Bearer token for all visitors
              </p>
            </div>
          </div>

          <a
            href="/"
            className={`inline-flex items-center space-x-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold border transition-colors ${
              isDark
                ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                : "border-slate-200 text-slate-700 hover:bg-slate-100"
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </a>
        </div>

        {!isUnlocked ? (
          <form onSubmit={handleUnlock} method="POST" aria-labelledby="unlock-heading" className="space-y-4">
            <h2 id="unlock-heading" className="text-sm font-bold flex items-center space-x-2">
              <Lock className="w-4 h-4 text-teal-500" />
              <span>Admin Authentication</span>
            </h2>

            <div className="space-y-1.5">
              <label htmlFor="admin-secret-input" className="block text-xs font-bold">
                Admin Secret <span aria-hidden="true">*</span>
              </label>
              <p id="admin-secret-hint" className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Matches the server-side ADMIN_SECRET environment variable.
              </p>
              <div className="relative flex items-center">
                <input
                  ref={secretInputRef}
                  id="admin-secret-input"
                  name="admin_secret"
                  type={showSecret ? "text" : "password"}
                  autoComplete="current-password"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={adminSecret}
                  onChange={(e) => {
                    setAdminSecret(e.target.value);
                    if (secretError) setSecretError("");
                  }}
                  aria-invalid={secretError ? "true" : undefined}
                  aria-describedby={secretError ? "admin-secret-hint admin-secret-error" : "admin-secret-hint"}
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((prev) => !prev)}
                  aria-pressed={showSecret}
                  aria-label={showSecret ? "Hide admin secret" : "Show admin secret"}
                  className={`absolute right-2 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg ${
                    isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {secretError && (
                <p id="admin-secret-error" role="alert" className="text-xs font-semibold text-rose-500">
                  {secretError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 min-h-[48px] rounded-xl font-bold text-sm text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {busy ? "Verifying..." : "Unlock Token Controls"}
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            {statusData && (
              <section
                aria-label="Current Token Status"
                className={`p-4 rounded-2xl border space-y-2 text-xs ${
                  isDark ? "bg-slate-800/70 border-slate-700" : "bg-slate-50 border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold flex items-center space-x-1.5">
                    {statusData.configured && !statusData.isExpired ? (
                      <>
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">Active & Valid</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                        <span className="text-rose-600 dark:text-rose-400">
                          {statusData.configured ? "Expired" : "Not Configured"}
                        </span>
                      </>
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={handleRefreshStatus}
                    disabled={busy}
                    className={`inline-flex items-center space-x-1 px-2.5 py-1.5 min-h-[32px] rounded-lg border font-semibold cursor-pointer ${
                      isDark ? "border-slate-600 hover:bg-slate-700" : "border-slate-300 hover:bg-white"
                    }`}
                  >
                    <RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                <dl className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <dt className={isDark ? "text-slate-400" : "text-slate-500"}>Token Preview</dt>
                    <dd className="font-mono font-semibold">{statusData.tokenPreview || "None"}</dd>
                  </div>
                  <div>
                    <dt className={isDark ? "text-slate-400" : "text-slate-500"}>Storage Backend</dt>
                    <dd className="font-mono font-semibold">{statusData.storageMode}</dd>
                  </div>
                  <div>
                    <dt className={isDark ? "text-slate-400" : "text-slate-500"}>Expires At</dt>
                    <dd className="font-semibold">
                      {statusData.expiresAt
                        ? new Date(statusData.expiresAt).toLocaleString()
                        : "N/A"}
                    </dd>
                  </div>
                  <div>
                    <dt className={isDark ? "text-slate-400" : "text-slate-500"}>Remaining</dt>
                    <dd className="font-semibold">
                      {statusData.remainingDays !== null ? `${statusData.remainingDays} day(s)` : "N/A"}
                    </dd>
                  </div>
                </dl>

                {!statusData.isGlobalPersistent && (
                  <p className="text-[11px] font-medium text-amber-600 dark:text-amber-300 pt-1">
                    Note: Configure MongoDB Atlas (MONGODB_URI) in Vercel Environment Variables for
                    persistent multi-instance updates across serverless cold starts.
                  </p>
                )}
              </section>
            )}

            <form onSubmit={handleRotateToken} method="POST" aria-labelledby="rotate-heading" className="space-y-4">
              <h2 id="rotate-heading" className="text-sm font-bold">
                Update Global Telemetry Token
              </h2>

              <div className="space-y-1.5">
                <label htmlFor="aqi-token-input" className="block text-xs font-bold">
                  New AQI.in Bearer JWT <span aria-hidden="true">*</span>
                </label>
                <p id="aqi-token-hint" className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Paste the full three-segment JWT token (with or without Bearer prefix).
                </p>
                <textarea
                  ref={tokenInputRef}
                  id="aqi-token-input"
                  name="aqi_token"
                  rows={4}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={newToken}
                  onChange={(e) => {
                    setNewToken(e.target.value);
                    if (tokenError) setTokenError("");
                  }}
                  aria-invalid={tokenError ? "true" : undefined}
                  aria-describedby={tokenError ? "aqi-token-hint aqi-token-error" : "aqi-token-hint"}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className={`${inputClass} font-mono text-xs min-h-[96px]`}
                />

                {parsedPreview && (
                  <div
                    className={`text-xs px-3 py-2 rounded-xl border ${
                      !parsedPreview.valid || parsedPreview.info?.isExpired
                        ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
                        : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                    }`}
                  >
                    {!parsedPreview.valid
                      ? "Malformed JWT format."
                      : parsedPreview.info?.isExpired
                      ? `Token expired at ${new Date(parsedPreview.info.expiresAt).toLocaleString()}.`
                      : `Valid JWT • Expires ${new Date(parsedPreview.info.expiresAt).toLocaleString()} (~${parsedPreview.info.remainingDays}d)`}
                  </div>
                )}

                {tokenError && (
                  <p id="aqi-token-error" role="alert" className="text-xs font-semibold text-rose-500">
                    {tokenError}
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 py-2.5 px-4 min-h-[48px] rounded-xl font-bold text-sm text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {busy ? "Saving Globally..." : "Save Global Token"}
                </button>
                <button
                  type="button"
                  onClick={handleClearToken}
                  disabled={busy}
                  className={`inline-flex items-center justify-center space-x-1.5 py-2.5 px-4 min-h-[48px] rounded-xl font-bold text-xs border transition-colors cursor-pointer ${
                    isDark
                      ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear Stored</span>
                </button>
              </div>
            </form>

            {feedback && (
              <div
                role={feedback.type === "error" ? "alert" : "status"}
                aria-live="polite"
                className={`p-3 rounded-xl border text-xs font-semibold flex items-center space-x-2 ${
                  feedback.type === "error"
                    ? "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-200"
                    : "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200"
                }`}
              >
                {feedback.type === "error" ? (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default TokenAdmin;
