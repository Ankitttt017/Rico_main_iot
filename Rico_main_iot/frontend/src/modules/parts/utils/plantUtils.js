import { ALLOWED_PLANT_CODES, DEFAULT_PLANTS } from "../constants";

export const normalizePlants = (rows = []) => {
  const merged = [...rows, ...DEFAULT_PLANTS].reduce((map, plant) => {
    const code = String(plant?.code || plant?.plant_code || "").trim().toUpperCase();
    if (!code || map.has(code)) return map;
    map.set(code, {
      id: plant.id || code,
      code,
      name: code === "1002" ? "Gurugram Plant" : code === "1008" ? "Bawal Plant" : plant.name || `${code} Plant`,
      location: code === "1002" ? "Gurugram, Haryana" : code === "1008" ? "Bawal, Haryana" : plant.location || "",
    });
    return map;
  }, new Map());

  return Array.from(merged.values())
    .filter((plant) => ALLOWED_PLANT_CODES.includes(plant.code))
    .sort((a, b) => ALLOWED_PLANT_CODES.indexOf(a.code) - ALLOWED_PLANT_CODES.indexOf(b.code));
};
