"use strict";

process.env.NODE_ENV = "production";

const test = require("node:test");
const assert = require("node:assert/strict");
const { hideServerErrors } = require("../src/middleware/security");

function respond(statusCode, body) {
  let sent = null;
  const res = {
    statusCode,
    json(payload) { sent = payload; return this; },
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    hideServerErrors({ method: "GET", originalUrl: "/api/x" }, res, () => {});
    res.json(body);
  } finally {
    console.error = originalError;
  }
  return sent;
}

test("raw error text in a 500 message is replaced", () => {
  const sent = respond(500, { success: false, message: "Invalid object name 'dbo.secret_table'." });
  assert.equal(sent.success, false);
  assert.doesNotMatch(sent.message, /secret_table/);
});

test("a friendly 500 message is kept but the error detail is dropped", () => {
  const sent = respond(500, { success: false, message: "Unable to login.", error: "Login failed for user 'sa'." });
  assert.deepEqual(sent, { success: false, message: "Unable to login." });
});

test("4xx and success responses pass through unchanged", () => {
  const conflict = { success: false, error: "USERNAME_TAKEN", message: "Username 'x' already exists" };
  assert.deepEqual(respond(409, conflict), conflict);
  assert.deepEqual(respond(200, { success: true, data: [1] }), { success: true, data: [1] });
});
