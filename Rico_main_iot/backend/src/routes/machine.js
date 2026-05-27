const express = require("express");
const {
  getMachines,
  createMachine,
  updateMachine,
  deleteMachine,
  getMachineOperations,
  assignMachineOperation,
  getMachineStatusHistory,
} = require("../controllers/machineController");

const router = express.Router();

router.get("/machines", getMachines);
router.post("/machines", createMachine);
router.put("/machines/:id", updateMachine);
router.delete("/machines/:id", deleteMachine);
router.get("/machines/:id/operations", getMachineOperations);
router.put("/machines/:id/operation", assignMachineOperation);
router.get("/machines/:id/status-history", getMachineStatusHistory);

module.exports = router;
