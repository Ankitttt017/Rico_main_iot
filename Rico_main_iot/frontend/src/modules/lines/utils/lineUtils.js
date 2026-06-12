import { PLANTS } from "../constants";

export const normalizeProtocolLabel = (protocol) => {
  const compact = String(protocol || "").replace(/[\s/]+/g, "").toLowerCase();
  if (compact === "tcpip" || compact === "tcpmodbus" || compact === "modbustcp") return "TCP/IP";
  return protocol || "SLMP";
};

export const getPlantByCode = (code) => PLANTS.find((plant) => plant.code === code) || PLANTS[0];

export const getPlantCodeFromValue = (value, fallbackCode = "1002") => {
  const text = String(value || "").trim();
  if (!text) return fallbackCode;
  const byCode = PLANTS.find((plant) => plant.code === text);
  if (byCode) return byCode.code;
  const byName = PLANTS.find((plant) => text.toLowerCase().includes(plant.name.toLowerCase().split(" ")[0]));
  if (byName) return byName.code;
  if (/bawal/i.test(text)) return "1008";
  if (/gurugram|gurgaon/i.test(text)) return "1002";
  return text || fallbackCode;
};

export const getLinePlantCode = (line = {}, fallbackCode = "1002") =>
  getPlantCodeFromValue(line.plant_code || line.plant, fallbackCode);

export const divisionMatches = (lineDivision, selectedDivision) => {
  if (!selectedDivision) return true;
  const lineText = String(lineDivision || "").toLowerCase();
  const selectedText = String(selectedDivision || "").toLowerCase();
  if (selectedText.includes("machining") || selectedText.includes("machine")) {
    return lineText.includes("machining") || lineText.includes("machine") || lineText.includes("mcs");
  }
  return lineText.includes(selectedText);
};

export const makeMachineDraft = (machine = {}) => ({
  id: machine.id || null,
  machine_code: machine.machine_code || "",
  name: machine.name || "",
  ip_address: machine.ip_address || "",
  port: machine.port || "",
  protocol: normalizeProtocolLabel(machine.protocol),
  part_name: machine.part_name || "",
  operation_no: machine.operation_no || "OP-10",
});
