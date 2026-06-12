import { DEFAULT_PLANTS } from "../constants";

export const normalizePlants = (rows = []) => {
  const activeRows = rows.filter((plant) => plant?.is_active !== false && plant?.is_active !== 0);
  const merged = [...activeRows, ...DEFAULT_PLANTS].reduce((map, plant) => {
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
    .sort((a, b) => a.name.localeCompare(b.name));
};
