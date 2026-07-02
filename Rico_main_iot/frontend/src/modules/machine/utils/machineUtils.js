import { LINES_BY_DIVISION } from "../constants";

export function getDivision(machine = {}) {
  const assignedDivision = String(machine.line_division || machine.category || "").trim();
  if (assignedDivision && assignedDivision.toLowerCase() !== "uncategorized") {
    return assignedDivision;
  }

  const n = `${machine.line_division || ""} ${machine.category || ""} ${machine.name || ""}`.toUpperCase();
  if (n.includes("H.P.D.C") || n.includes("HPDC") || n.includes("TILTING") ||
      n.includes("FURNACE") || n.includes("DOSING") || n.includes("DEGASSING") ||
      n.includes("TRIMMING PRESS") || n.includes("VIBRO") ||
      n.includes("COOLING TOWER") || n.includes("E.O.T") || n.includes("EOT") ||
      n.includes("ROBO")) {
    return "HPDC";
  }
  return "Machining";
}

export function getLineCode(machine = {}) {
  if (machine.line_code) return String(machine.line_code);
  const n = String(machine.name || "").toUpperCase();
  if (n.includes("FURNACE") || n.includes("TILTING") || n.includes("DOSING")) return "F01";
  if (n.includes("TRIMMING") || n.includes("VIBRO")) return "C33";
  if (n.includes("1800T")) return "C06";
  if (n.includes("1400T")) return "C06";
  if (n.includes("1050T")) return "C05";
  if (n.includes("800T")) return "C04";
  if (n.includes("660T") || n.includes("560T") || n.includes("500T")) return "C03";
  if (n.includes("420T") || n.includes("350T")) return "C02";
  if (n.includes("250T") || n.includes("150T") || n.includes("135T")) return "C01";
  if (n.includes("BROACH")) return "M01";
  if (n.includes("BORING") && n.includes("SPM")) return "M03";
  if (n.includes("PAINT") || n.includes("ADHESIVE") || n.includes("COATING") || n.includes("BAKING")) return "P01";
  if (n.includes("DEGASSING")) return "M20";
  return "";
}

export function getLineName(machine = {}, code = "") {
  if (machine.line_name) return String(machine.line_name);
  const all = LINES_BY_DIVISION[""];
  return all.find((line) => line.value === code)?.label || (code ? code : "All Lines");
}

export function getMachineType(machine = {}) {
  const n = `${machine.name || ""} ${machine.category || ""}`.toUpperCase();
  if (n.includes("H.P.D.C") || n.includes("HPDC")) return "hpdc";
  if (n.includes("CNC") || n.includes("VMC") || n.includes("HMC")) return "cnc";
  if (n.includes("BROACH")) return "broach";
  if (n.includes("BORING")) return "boring";
  if (n.includes("GRIND")) return "grind";
  if (n.includes("FURNACE")) return "furnace";
  if (n.includes("CRANE") || n.includes("E.O.T") || n.includes("EOT")) return "crane";
  if (n.includes("TRIMM")) return "trim";
  return "general";
}

export const safeText = (value, fallback = "-") => String(value || "").trim() || fallback;
