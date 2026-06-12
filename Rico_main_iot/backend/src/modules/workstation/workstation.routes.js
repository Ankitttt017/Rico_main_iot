"use strict";

const express = require("express");
const {
  closeDowntimeEvent,
  createDowntimeEvent,
  getWorkstationSummary,
  listDowntimeEvents,
} = require("./workstation.controller");

const router = express.Router();

router.get("/summary", getWorkstationSummary);
router.get("/downtime-events", listDowntimeEvents);
router.post("/downtime-events", createDowntimeEvent);
router.patch("/downtime-events/:id/close", closeDowntimeEvent);

module.exports = router;
