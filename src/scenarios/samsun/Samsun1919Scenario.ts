import type { ScenarioModule } from "../types";
import { SamsunScene } from "./SamsunScene";

/** Samsun · 19 Mayıs 1919 — Milli Mücadele'nin Başlangıcı. Lazily loaded as its own code chunk. */
const module: ScenarioModule = {
  id: "samsun_1919",
  cityId: "samsun",
  label: "Samsun · 19 Mayıs 1919 — Milli Mücadele'nin Başlangıcı",
  ambience: { wind: 0.22, sea: 0.12, camp: 0.12 },
  missionIds: ["samsun_m01", "samsun_m02", "samsun_m03", "samsun_m04", "samsun_m05", "samsun_m06"],
  create: (services, opts) => SamsunScene.create(services, opts),
};

export default module;
