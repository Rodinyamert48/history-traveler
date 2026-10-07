import type { Vector3 } from "@babylonjs/core";
import type { DialogueLine } from "../ui/DialogueUI";

export type MinigameKind = "ship" | "cannon" | "siege";

export type ObjectiveDef =
  | { type: "talk"; npc: string; text: string; dialogue: string; prompt?: string }
  | { type: "reach"; anchor: string; radius: number; text: string }
  | { type: "interact"; targets: string[]; text: string; prompt: string; hold?: number; key?: "E" | "F" }
  | { type: "deliver"; pickup: string; drop: string; count: number; text: string; pickupPrompt: string; dropPrompt: string; item: string }
  | { type: "minigame"; minigame: MinigameKind; anchor: string; text: string; prompt?: string; autoRadius?: number }
  | { type: "hold"; anchor: string; text: string; prompt: string; time: number; key?: "E" | "F" };

export interface MissionDef {
  id: string;
  title: string;
  description: string;
  /** Category for UI/analytics: story | collect | deliver | minigame | combat. */
  type: "story" | "collect" | "deliver" | "minigame" | "combat";
  date?: string;
  objectives: ObjectiveDef[];
  reward: { text: string; unlock?: string };
  nextMission: string | null;
  /** Dialogue played as soon as the mission starts. */
  intro?: string;
  /** Dialogue played when the last objective completes. */
  outro?: string;
  /** Scenario hook ids run when the mission starts / completes (also replayed on resume). */
  onStart?: string[];
  onComplete?: string[];
}

export interface ScenarioMissionFile {
  scenario: string;
  firstMission: string;
  missions: MissionDef[];
  dialogues: Record<string, DialogueLine[]>;
}

/** What the mission system needs from the hosting scenario (keeps missions engine-agnostic). */
export interface MissionHost {
  anchor(id: string): Vector3 | null;
  npcPosition(id: string): Vector3 | null;
  npcName(id: string): string;
  playerPosition(): Vector3;
  playDialogue(id: string, speakerNpc?: string): Promise<void>;
  startMinigame(kind: MinigameKind): Promise<boolean>;
  runHook(id: string, phase: "start" | "complete" | "resume"): void;
  addInteractable(def: {
    id: string;
    position: () => Vector3;
    key: "E" | "F";
    prompt: string;
    holdTime?: number;
    enabled: () => boolean;
    onInteract: () => void;
  }): void;
  removeInteractable(id: string): void;
  setCarry(item: string | null): void;
  onTargetDone(targetId: string): void;
  notify(kind: "mission" | "objective" | "complete" | "toast", title: string, subtitle?: string): void;
}
