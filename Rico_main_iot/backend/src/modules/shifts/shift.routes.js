"use strict";

const express = require("express");
const router = express.Router();
const {
  getAllShifts,
  createShift,
  updateShift,
  toggleShiftStatus,
  deleteShift,
} = require("./shift.controller");
const { requirePermission } = require("../../middleware/auth");

const canConfigure = requirePermission("system:config");

router.get("/", getAllShifts);
router.post("/", canConfigure, createShift);
router.put("/:id", canConfigure, updateShift);
router.patch("/:id/toggle", canConfigure, toggleShiftStatus);
router.delete("/:id", canConfigure, deleteShift);

module.exports = router;
