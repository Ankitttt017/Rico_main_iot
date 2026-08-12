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

router.get("/", getAllShifts);
router.post("/", createShift);
router.put("/:id", updateShift);
router.patch("/:id/toggle", toggleShiftStatus);
router.delete("/:id", deleteShift);

module.exports = router;
