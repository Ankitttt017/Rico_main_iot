export const PAGE_SIZE = 50;

export const PLANTS = [];

export const PLANT_OPTIONS = PLANTS.map((plant) => ({
  value: plant.code,
  label: `${plant.name} (${plant.code})`,
  description: plant.name,
  keywords: `${plant.name} ${plant.code}`,
}));

export const DIVISION_OPTIONS = [
  { value: "HPDC", label: "1. HPDC", keywords: "hpdc" },
  { value: "Machining", label: "2. Machining", keywords: "machining machine shop mcs machine" },
];

export const FILTER_DIVISION_OPTIONS = [
  { value: "", label: "All Departments" },
  ...DIVISION_OPTIONS,
];

export const STATUS_OPTIONS = [
  { value: "1", label: "Active" },
  { value: "0", label: "Inactive" },
];

export const FILTER_STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  ...STATUS_OPTIONS,
];

export const PROTOCOL_OPTIONS = [
  { value: "SLMP", label: "SLMP" },
  { value: "TCP/IP", label: "TCP/IP", keywords: "tcp ip ethernet" },
];

export const FALLBACK_OPERATIONS = [
  ["OP-10", "Incoming Inspection (Aluminium Alloy Ingots)"],
  ["OP-20A", "Melting of Aluminium Alloy Ingots"],
  ["OP-20B", "Degassing & Metal Treatment of Molten Metal"],
  ["OP-20C", "Holding of Molten Metal for Casting"],
  ["OP-30", "Die Casting"],
  ["OP-40", "Trimming"],
  ["OP-50", "Shot Blasting"],
  ["OP-50B", "Final Inspection (Casting)"],
  ["OP-60", "Face Milling, Drilling, Reaming, Tapping & Boring"],
  ["OP-70", "Pre-Inspection"],
  ["OP-80", "Marking (Dot Marking)"],
  ["OP-90", "Leak Testing"],
  ["OP-100", "Ultrasonic Washing"],
  ["OP-110", "Final Inspection / Visual Inspection"],
  ["OP-120", "Packaging"],
].map(([operation_no, operation_name]) => ({ operation_no, operation_name }));

export const emptyLine = {
  plant: "",
  line_name: "",
  division: "HPDC",
  is_active: true,
};

export const emptyMachine = {
  id: null,
  machine_code: "",
  name: "",
  ip_address: "",
  port: "",
  protocol: "SLMP",
  part_name: "",
  operation_no: "OP-10",
};
