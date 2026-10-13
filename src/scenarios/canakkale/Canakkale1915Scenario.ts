import type { ScenarioModule } from "../types";
import { CanakkaleScene } from "./CanakkaleScene";

/** Çanakkale · 18 Mart 1915 — Çanakkale Deniz Zaferi. Lazily loaded as its own code chunk. */
const module: ScenarioModule = {
  id: "canakkale_1915",
  cityId: "canakkale",
  label: "Çanakkale · 18 Mart 1915 — Çanakkale Deniz Zaferi",
  ambience: { wind: 0.22, sea: 0.14, camp: 0.08 },
  missionIds: ["canakkale_m01", "canakkale_m02", "canakkale_m03", "canakkale_m04", "canakkale_m05", "canakkale_m06"],
  create: (services, opts) => CanakkaleScene.create(services, opts),
};

export default module;
