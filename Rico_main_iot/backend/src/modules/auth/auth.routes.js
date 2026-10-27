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
const { requirePermission } = require("../../middleware/auth");

const router = express.Router();
const canManageUsers = requirePermission("roles:manage");

router.get("/roles", listRoles);
router.post("/login", login);
router.get("/users", canManageUsers, listUsers);
router.get("/users/check-username", canManageUsers, checkUsername);
router.post("/users", canManageUsers, createUser);
router.patch("/users/:id", canManageUsers, updateUser);
router.delete("/users/:id", canManageUsers, deleteUser);
router.patch("/users/:id/toggle", canManageUsers, toggleUser);
router.patch("/users/:id/reset-password", canManageUsers, resetPassword);

module.exports = router;
