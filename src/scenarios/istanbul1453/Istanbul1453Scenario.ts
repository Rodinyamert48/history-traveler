import type { ScenarioModule } from "../types";
import { IstanbulScene } from "./IstanbulScene";

/** İstanbul — 1453: İstanbul'un Fethi. Lazily loaded as its own code chunk. */
const module: ScenarioModule = {
  id: "istanbul_1453",
  cityId: "istanbul",
  missionIds: ["mission_001", "mission_002", "mission_003", "mission_004", "mission_005", "mission_006", "mission_007", "mission_008"],
  create: (services, opts) => IstanbulScene.create(services, opts),
};

export default module;
