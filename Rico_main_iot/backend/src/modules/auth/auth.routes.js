"use strict";

const express = require("express");
const {
  checkUsername,
  createUser,
  deleteUser,
  listRoles,
  listUsers,
  login,
  resetPassword,
  toggleUser,
  updateUser,
} = require("./auth.controller");

const router = express.Router();

router.get("/roles", listRoles);
router.post("/login", login);
router.get("/users", listUsers);
router.get("/users/check-username", checkUsername);
router.post("/users", createUser);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);
router.patch("/users/:id/toggle", toggleUser);
router.patch("/users/:id/reset-password", resetPassword);

module.exports = router;
