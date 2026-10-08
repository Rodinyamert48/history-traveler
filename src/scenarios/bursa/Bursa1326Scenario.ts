import type { ScenarioModule } from "../types";
import { BursaScene } from "./BursaScene";

/** Bursa · 1326 — Bursa'nın Fethi. Lazily loaded as its own code chunk. */
const module: ScenarioModule = {
  id: "bursa_1326",
  cityId: "bursa",
  label: "Bursa · 1326 — Bursa'nın Fethi",
  ambience: { wind: 0.12, camp: 0.32 },
  missionIds: ["bursa_m01", "bursa_m02", "bursa_m03", "bursa_m04", "bursa_m05", "bursa_m06", "bursa_m07"],
  create: (services, opts) => BursaScene.create(services, opts),
};

export default module;
