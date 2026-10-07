import type { ScenarioModule } from "./types";

/**
 * Scenario registry. Each city's scenario is a lazily-loaded code chunk, so adding Ankara
 * (1920), İzmir (1922) … later only means registering a new loader here and flipping
 * `active` in public/data/cities.json.
 */
export const SCENARIO_LOADERS: Record<string, () => Promise<ScenarioModule>> = {
  istanbul_1453: () => import("./istanbul1453/Istanbul1453Scenario").then((m) => m.default),
};

export async function loadScenario(id: string): Promise<ScenarioModule> {
  const loader = SCENARIO_LOADERS[id];
  if (!loader) throw new Error(`Unknown scenario "${id}"`);
  return loader();
}
