"use strict";

process.env.JWT_SECRET = "test-secret";
process.env.AUTH_ENFORCED = "true";
process.env.API_KEYS = "third-party-key, second-key";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  signToken,
  verifyToken,
  requireAuth,
  requirePermission,
  socketAuth,
} = require("../src/middleware/auth");

const admin = { id: 1, username: "admin", role_key: "SYSTEM_ADMIN", permissions: ["roles:manage"] };
const operator = { id: 2, username: "operator", role_key: "OPERATOR", permissions: ["workstation:view"] };

function run(middleware, req) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nextCalled = false;
  middleware({ headers: {}, query: {}, method: "GET", path: "/machines", ...req }, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test("signed token round-trips the user identity and permissions", () => {
  const payload = verifyToken(signToken(admin));
  assert.equal(payload.sub, "1");
  assert.equal(payload.username, "admin");
  assert.equal(payload.role, "SYSTEM_ADMIN");
  assert.deepEqual(payload.permissions, ["roles:manage"]);
});

test("tampered or foreign tokens are rejected", () => {
  const token = signToken(operator);
  assert.equal(verifyToken(`${token}x`), null);
  assert.equal(verifyToken("not-a-token"), null);
  assert.equal(verifyToken(""), null);
});

test("API requests without a token get 401", () => {
  const { res, nextCalled } = run(requireAuth, {});
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("login and health stay public", () => {
  assert.equal(run(requireAuth, { method: "POST", path: "/auth/login" }).nextCalled, true);
  assert.equal(run(requireAuth, { method: "GET", path: "/health" }).nextCalled, true);
});

test("a bearer token sets req.user", () => {
  const req = { headers: { authorization: `Bearer ${signToken(operator)}` } };
  const { nextCalled } = run(requireAuth, req);
  assert.equal(nextCalled, true);
});

test("download links may pass the token as access_token on GET only", () => {
  const token = signToken(operator);
  assert.equal(run(requireAuth, { query: { access_token: token } }).nextCalled, true);
  assert.equal(run(requireAuth, { method: "POST", query: { access_token: token } }).nextCalled, false);
});

test("a configured API key allows GET requests only", () => {
  const viaHeader = run(requireAuth, { headers: { "x-api-key": "third-party-key" } });
  assert.equal(viaHeader.nextCalled, true);
  assert.equal(run(requireAuth, { query: { api_key: "second-key" } }).nextCalled, true);
  assert.equal(run(requireAuth, { headers: { "x-api-key": "wrong-key" } }).nextCalled, false);
  assert.equal(run(requireAuth, { method: "POST", headers: { "x-api-key": "third-party-key" } }).nextCalled, false);
});

test("API key clients have no permissions", () => {
  const req = { headers: { "x-api-key": "third-party-key" } };
  run(requireAuth, req);
  const canManageUsers = requirePermission("roles:manage");
  assert.equal(run(canManageUsers, { user: { username: "api-client", permissions: [] } }).res.statusCode, 403);
});

test("requirePermission blocks users without the permission", () => {
  const canManageUsers = requirePermission("roles:manage");
  assert.equal(run(canManageUsers, { user: verifyToken(signToken(admin)) }).nextCalled, true);
  const denied = run(canManageUsers, { user: verifyToken(signToken(operator)) });
  assert.equal(denied.nextCalled, false);
  assert.equal(denied.res.statusCode, 403);
});

test("a body performedBy cannot stand in for the token user", () => {
  const canManageUsers = requirePermission("roles:manage");
  const { nextCalled } = run(canManageUsers, { body: { performedBy: "admin" } });
  assert.equal(nextCalled, false);
});

test("socket connections need a valid token", () => {
  let error = null;
  const socket = { handshake: { auth: {} }, data: {} };
  socketAuth(socket, (err) => { error = err; });
  assert.ok(error);

  error = undefined;
  const authed = { handshake: { auth: { token: signToken(operator) } }, data: {} };
  socketAuth(authed, (err) => { error = err; });
  assert.equal(error, undefined);
  assert.equal(authed.data.user.username, "operator");
});
