import { EventBus } from "./EventBus";
import type { Settings } from "./SaveManager";

export interface GameEventMap extends Record<string, unknown> {
  "settings:changed": { settings: Settings; changed: (keyof Settings)[] };
  "mission:started": { scenarioId: string; missionId: string };
  "mission:objective": { scenarioId: string; missionId: string; objectiveIndex: number };
  "mission:completed": { scenarioId: string; missionId: string };
  "scenario:completed": { scenarioId: string; cityId: string };
  "ui:click": void;
}

/** Global game-wide event bus. Scene-local buses are created per scene. */
export const gameEvents = new EventBus<GameEventMap>();
