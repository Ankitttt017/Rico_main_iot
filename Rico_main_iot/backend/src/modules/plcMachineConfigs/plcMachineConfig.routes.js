"use strict";

const express = require("express");
const {
  deleteMachine,
  listMachines,
  listTemplates,
  saveMachine,
  saveTemplate,
  testConnection,
} = require("./plcMachineConfig.controller");

const router = express.Router();

router.get("/", listMachines);
router.post("/", saveMachine);
router.get("/templates", listTemplates);
router.post("/templates", saveTemplate);
router.delete("/:id", deleteMachine);
router.post("/test-connection", testConnection);

module.exports = router;
