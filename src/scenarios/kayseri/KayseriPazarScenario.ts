import type { ScenarioModule } from "../types";
import { KayseriScene } from "./KayseriScene";

/** Kayseri · 1390 — Ticaretin ve Pazarlığın Keşfi. Lazily loaded as its own code chunk. */
const module: ScenarioModule = {
  id: "kayseri_pazar",
  cityId: "kayseri",
  label: "Kayseri · 1390 — Ticaretin ve Pazarlığın Keşfi",
  ambience: { camp: 0.42, wind: 0.04 },
  missionIds: ["kayseri_m01", "kayseri_m02", "kayseri_m03", "kayseri_m04", "kayseri_m05", "kayseri_m06", "kayseri_m07", "kayseri_m08"],
  create: (services, opts) => KayseriScene.create(services, opts),
};

export default module;
