"use strict";

const TARGET_MACHINE = {
  key: "ube-850t-2",
  ip: "192.168.117.201",
  port: 5002,
  name: "UBE 850T-2",
  kind: "ube",
};

const DEFAULT_MACHINES = [
  TARGET_MACHINE,
];

const TARGET_MACHINE_NAME = "UBE 850T-2";
const TARGET_MACHINE_IP = "192.168.117.201";

function isTargetMachine(machine = {}) {
  return (
    String(machine.ip || "").trim() === TARGET_MACHINE_IP ||
    String(machine.key || "").trim().toLowerCase() === TARGET_MACHINE.key ||
    String(machine.name || "").trim().toLowerCase() === TARGET_MACHINE_NAME.toLowerCase()
  );
}

function normalizeTargetMachine(machine = {}) {
  return {
    ...TARGET_MACHINE,
    ...machine,
    key: TARGET_MACHINE.key,
    ip: TARGET_MACHINE_IP,
    port: Number(machine.port || TARGET_MACHINE.port),
    name: TARGET_MACHINE_NAME,
    kind: "ube",
  };
}

function getMachines() {
  if (process.env.PLC_MACHINES_JSON) {
    try {
      const parsed = JSON.parse(process.env.PLC_MACHINES_JSON);
      if (Array.isArray(parsed) && parsed.length) {
        const targetMachines = parsed
          .map((machine, index) => ({
            key: machine.key || machine.machine_key || machine.ip || `machine-${index + 1}`,
            ip: machine.ip,
            port: Number(machine.port || 5002),
            name: machine.name || machine.ip,
            kind: machine.kind || "ube",
          }))
          .filter((machine) => machine.ip && isTargetMachine(machine))
          .map(normalizeTargetMachine);

        if (targetMachines.length) return targetMachines.slice(0, 1);
      }
    } catch (error) {
      console.error("Invalid PLC_MACHINES_JSON:", error.message);
    }
  }
  return DEFAULT_MACHINES.map(normalizeTargetMachine);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CONSTANTS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

module.exports = {
  TARGET_MACHINE,
  DEFAULT_MACHINES,
  TARGET_MACHINE_NAME,
  TARGET_MACHINE_IP,
  isTargetMachine,
  normalizeTargetMachine,
  getMachines,
};
