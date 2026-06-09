"use strict";

const express = require("express");
const {
  deleteMachine,
  listMachines,
  saveMachine,
  testConnection,
} = require("./plcMachineConfig.controller");

const router = express.Router();

router.get("/", listMachines);
router.post("/", saveMachine);
router.delete("/:id", deleteMachine);
router.post("/test-connection", testConnection);

module.exports = router;
