"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// AUTH_ENFORCED=false is an emergency switch only: requests without a valid token are let through.
const AUTH_ENFORCED = String(process.env.AUTH_ENFORCED || "true").toLowerCase() !== "false";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";

let JWT_SECRET = String(process.env.JWT_SECRET || "").trim();
if (!JWT_SECRET) {
  // Without a fixed secret every backend restart logs all users out.
  JWT_SECRET = crypto.randomBytes(48).toString("hex");
  console.warn("[AUTH] JWT_SECRET is not set; using a random secret (users must log in again after each restart).");
}
if (!AUTH_ENFORCED) {
  console.warn("[AUTH] AUTH_ENFORCED=false: API and socket requests are NOT authenticated.");
}

// Fixed keys for third-party systems that cannot log in (comma-separated API_KEYS). Read-only: GET requests only.
const API_KEYS = String(process.env.API_KEYS || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);
const API_CLIENT_USER = { sub: "api-client", username: "api-client", role: "API_CLIENT", permissions: [] };

// Reachable without a token (method + path relative to /api).
const PUBLIC_ROUTES = [
  ["GET", "/health"],
  ["POST", "/auth/login"],
];

function signToken(user = {}) {
  return jwt.sign(
    {
      sub: String(user.id || ""),
      username: user.username,
      role: user.role_key,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(String(token), JWT_SECRET);
  } catch {
    return null;
  }
}

function tokenFromRequest(req) {
  const header = String(req.headers.authorization || "");
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  // Plain <a href> downloads (Excel exports, part sheets) cannot send headers.
  if (req.method === "GET" && req.query?.access_token) return String(req.query.access_token);
  return null;
}

function hasValidApiKey(req) {
  if (req.method !== "GET" || !API_KEYS.length) return false;
  const supplied = String(req.headers["x-api-key"] || req.query?.api_key || "");
  if (!supplied) return false;
  const suppliedHash = crypto.createHash("sha256").update(supplied).digest();
  return API_KEYS.some((key) => crypto.timingSafeEqual(suppliedHash, crypto.createHash("sha256").update(key).digest()));
}

function isPublicRoute(req) {
  return PUBLIC_ROUTES.some(([method, path]) => req.method === method && req.path === path);
}

function requireAuth(req, res, next) {
  if (req.method === "OPTIONS" || isPublicRoute(req)) return next();
  const payload = verifyToken(tokenFromRequest(req));
  if (payload) {
    req.user = payload;
    return next();
  }
  if (hasValidApiKey(req)) {
    req.user = API_CLIENT_USER;
    return next();
  }
  if (!AUTH_ENFORCED) return next();
  return res.status(401).json({ success: false, message: "Login required." });
}

// Same rule as the frontend route guard: the permission itself, its ":manage" variant, or roles:manage.
function hasPermission(user, permission) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const managePermission = permission.replace(":view", ":manage");
  return permissions.includes(permission) || permissions.includes(managePermission) || permissions.includes("roles:manage");
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user && !AUTH_ENFORCED) return next();
    if (hasPermission(req.user, permission)) return next();
    return res.status(403).json({ success: false, message: "You do not have permission for this action." });
  };
}

function socketAuth(socket, next) {
  const payload = verifyToken(socket.handshake?.auth?.token);
  if (payload) {
    socket.data.user = payload;
    return next();
  }
  if (!AUTH_ENFORCED) return next();
  return next(new Error("Login required."));
}

module.exports = {
  AUTH_ENFORCED,
  signToken,
  verifyToken,
  requireAuth,
  requirePermission,
  socketAuth,
};
