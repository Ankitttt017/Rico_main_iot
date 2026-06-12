"use strict";

const express = require("express");
const {
  createLocation,
  deleteLocation,
  listLocations,
  updateLocation,
} = require("./location.controller");

const router = express.Router();

router.get("/", listLocations);
router.post("/", createLocation);
router.put("/:id", updateLocation);
router.delete("/:id", deleteLocation);

module.exports = router;
