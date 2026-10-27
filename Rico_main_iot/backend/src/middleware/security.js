"use strict";

const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// CORS_ORIGIN: comma separated list of allowed frontend origins, e.g.
//   CORS_ORIGIN=http://192.168.100.136,http://localhost:5173
// Not set = any origin (old behaviour), with a warning.
const CORS_ORIGINS = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((item) => item.trim().replace(/\/+$/, ""))
  .filter(Boolean);

if (!CORS_ORIGINS.length) {
  console.warn("[SECURITY] CORS_ORIGIN is not set; the API accepts requests from any origin.");
}

const corsOrigin = CORS_ORIGINS.length ? CORS_ORIGINS : "*";

// Keyed on IP + username: users behind the same proxy/NAT do not share one bucket,
// and the account lockout in auth.controller covers guessing one user from many IPs.
const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Math.max(1, Number(process.env.AUTH_LOGIN_RATE_LIMIT || 10)),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip || "")}:${String(req.body?.username || "").trim().toLowerCase()}`,
  message: { success: false, message: "Too many login attempts. Please wait a minute and try again." },
});

// In production, 5xx responses must not leak SQL errors, table names or stack traces.
// Controllers that send { message: "<friendly text>", error: error.message } keep their
// friendly message; a bare { message: error.message } is replaced with a generic one.
// The original body is logged so the detail is still available on the server.
function hideServerErrors(req, res, next) {
  if (!IS_PRODUCTION) return next();
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 500 || !body || typeof body !== "object") return json(body);
    console.error(`[API ${res.statusCode}] ${req.method} ${req.originalUrl}:`, body.error || body.message || body);
    const hasFriendlyMessage = Object.prototype.hasOwnProperty.call(body, "error") && body.message;
    return json({
      success: false,
      message: hasFriendlyMessage ? body.message : "Internal server error. Please try again or contact support.",
    });
  };
  next();
}

module.exports = {
  corsOrigin,
  loginRateLimiter,
  hideServerErrors,
};
