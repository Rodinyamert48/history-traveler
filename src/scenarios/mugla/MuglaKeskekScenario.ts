import type { ScenarioModule } from "../types";
import { MuglaScene } from "./MuglaScene";

/** Muğla · Menteşe — Keşkeğin Keşfi. Lazily loaded as its own code chunk. */
const module: ScenarioModule = {
  id: "mugla_keskek",
  cityId: "mugla",
  label: "Muğla · Menteşe — Keşkeğin Keşfi",
  ambience: { wind: 0.3, forest: 0.55, camp: 0.2 },
  missionIds: ["mugla_m01", "mugla_m02", "mugla_m03", "mugla_m04", "mugla_m05", "mugla_m06", "mugla_m07", "mugla_m08"],
  create: (services, opts) => MuglaScene.create(services, opts),
};

export default module;
