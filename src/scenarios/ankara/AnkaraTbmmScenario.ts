import type { ScenarioModule } from "../types";
import { AnkaraScene } from "./AnkaraScene";

/** Ankara · 23 Nisan 1920 — TBMM'nin Açılışı. Lazily loaded as its own code chunk. */
const module: ScenarioModule = {
  id: "ankara_1920",
  cityId: "ankara",
  label: "Ankara · 23 Nisan 1920 — TBMM'nin Açılışı",
  ambience: { camp: 0.15, wind: 0.06 },
  missionIds: ["ankara_m01", "ankara_m02", "ankara_m03", "ankara_m04", "ankara_m05", "ankara_m06", "ankara_m07"],
  create: (services, opts) => AnkaraScene.create(services, opts),
};

export default module;
