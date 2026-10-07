import { Vector3 } from "@babylonjs/core";
import { gameEvents } from "../core/GameEvents";
import type { SaveManager } from "../core/SaveManager";
import type { MissionDef, MissionHost, ObjectiveDef, ScenarioMissionFile } from "./types";

/**
 * Generic, data-driven mission runner. Missions are plain JSON (see
 * public/data/scenarios/*.json); the scenario provides a MissionHost implementation for
 * world queries, dialogue, minigames and hooks. Progress is persisted via SaveManager.
 */
export class MissionManager {
  private missions = new Map<string, MissionDef>();
  current: MissionDef | null = null;
  objectiveIndex = 0;
  private progress = 0;
  private done = new Set<string>();
  private carrying = false;
  private busy = false;
  private registered: string[] = [];
  onScenarioComplete: (() => void) | null = null;
  onChanged: (() => void) | null = null;

  constructor(
    readonly data: ScenarioMissionFile,
    private readonly host: MissionHost,
    private readonly save: SaveManager,
  ) {
    for (const m of data.missions) this.missions.set(m.id, m);
  }

  get missionIds(): string[] {
    return [...this.missions.keys()];
  }

  get objective(): ObjectiveDef | null {
    return this.current?.objectives[this.objectiveIndex] ?? null;
  }

  get isBusy(): boolean {
    return this.busy;
  }

  /** Re-applies the world changes of all missions before `missionId` (resume support). */
  fastForwardTo(missionId: string): void {
    let id: string | null = this.data.firstMission;
    while (id && id !== missionId) {
      const m = this.missions.get(id);
      if (!m) break;
      for (const h of m.onStart ?? []) this.host.runHook(h, "resume");
      for (const h of m.onComplete ?? []) this.host.runHook(h, "resume");
      id = m.nextMission;
    }
  }

  async start(missionId: string): Promise<void> {
    const m = this.missions.get(missionId);
    if (!m) throw new Error(`Unknown mission ${missionId}`);
    this.clearRegistrations();
    this.current = m;
    this.objectiveIndex = 0;
    this.progress = 0;
    this.done.clear();
    this.carrying = false;
    this.host.setCarry(null);
    for (const h of m.onStart ?? []) this.host.runHook(h, "start");
    this.host.notify("mission", m.title, m.date);
    gameEvents.emit("mission:started", { scenarioId: this.data.scenario, missionId: m.id });
    this.onChanged?.();
    if (m.intro) {
      this.busy = true;
      await this.host.playDialogue(m.intro);
      this.busy = false;
    }
    this.setupObjective();
  }

  private clearRegistrations(): void {
    for (const id of this.registered) this.host.removeInteractable(id);
    this.registered = [];
  }

  /** Anchors are ground positions; interaction points sit at chest height. */
  private anchorPoint(id: string): Vector3 {
    const a = this.host.anchor(id);
    return a ? a.add(new Vector3(0, 1, 0)) : this.host.playerPosition();
  }

  private register(def: Parameters<MissionHost["addInteractable"]>[0]): void {
    this.host.addInteractable(def);
    this.registered.push(def.id);
  }

  /** Text shown in the HUD for the active objective, including counters. */
  objectiveText(): string {
    const o = this.objective;
    if (!o) return "";
    if (o.type === "interact") return `${o.text} (${this.done.size}/${o.targets.length})`;
    if (o.type === "deliver") return `${o.text} (${this.progress}/${o.count})`;
    return o.text;
  }

  /** Current waypoint world position for the HUD marker. */
  waypoint(): Vector3 | null {
    const o = this.objective;
    if (!o || this.busy) return null;
    switch (o.type) {
      case "talk":
        return this.host.npcPosition(o.npc);
      case "reach":
      case "minigame":
      case "hold":
        return this.host.anchor(o.anchor);
      case "interact": {
        const me = this.host.playerPosition();
        let best: Vector3 | null = null;
        let bestD = Infinity;
        for (const t of o.targets) {
          if (this.done.has(t)) continue;
          const p = this.host.anchor(t);
          if (!p) continue;
          const d = Math.hypot(p.x - me.x, p.z - me.z);
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
        return best;
      }
      case "deliver":
        return this.host.anchor(this.carrying ? o.drop : o.pickup);
    }
  }

  private setupObjective(): void {
    this.clearRegistrations();
    const o = this.objective;
    this.onChanged?.();
    if (!o) return;
    gameEvents.emit("mission:objective", { scenarioId: this.data.scenario, missionId: this.current!.id, objectiveIndex: this.objectiveIndex });
    switch (o.type) {
      case "talk": {
        this.register({
          id: `talk:${o.npc}`,
          position: () => (this.host.npcPosition(o.npc) ?? this.host.playerPosition()).add(new Vector3(0, 1.5, 0)),
          key: "E",
          prompt: o.prompt ?? `Konuş — ${this.host.npcName(o.npc)}`,
          enabled: () => !this.busy,
          onInteract: () => void this.runDialogueObjective(o.dialogue, o.npc),
        });
        break;
      }
      case "interact": {
        for (const t of o.targets) {
          this.register({
            id: `interact:${t}`,
            position: () => this.anchorPoint(t),
            key: o.key ?? "E",
            prompt: o.prompt,
            holdTime: o.hold,
            enabled: () => !this.busy && !this.done.has(t),
            onInteract: () => {
              this.done.add(t);
              this.host.onTargetDone(t);
              this.host.notify("toast", `${o.text} (${this.done.size}/${o.targets.length})`);
              this.onChanged?.();
              if (this.done.size >= o.targets.length) void this.completeObjective();
            },
          });
        }
        break;
      }
      case "deliver": {
        this.register({
          id: `pickup:${o.pickup}`,
          position: () => this.anchorPoint(o.pickup),
          key: "E",
          prompt: o.pickupPrompt,
          enabled: () => !this.busy && !this.carrying,
          onInteract: () => {
            this.carrying = true;
            this.host.setCarry(o.item);
            this.onChanged?.();
          },
        });
        this.register({
          id: `drop:${o.drop}`,
          position: () => this.anchorPoint(o.drop),
          key: "E",
          prompt: o.dropPrompt,
          enabled: () => !this.busy && this.carrying,
          onInteract: () => {
            this.carrying = false;
            this.host.setCarry(null);
            this.progress++;
            this.host.onTargetDone(`${o.drop}:${this.progress}`);
            this.host.notify("toast", `${o.text} (${this.progress}/${o.count})`);
            this.onChanged?.();
            if (this.progress >= o.count) void this.completeObjective();
          },
        });
        break;
      }
      case "minigame": {
        if (!o.autoRadius) {
          this.register({
            id: `minigame:${o.minigame}`,
            position: () => this.anchorPoint(o.anchor),
            key: "E",
            prompt: o.prompt ?? "Başla",
            enabled: () => !this.busy,
            onInteract: () => void this.runMinigame(o.minigame),
          });
        }
        break;
      }
      case "hold": {
        this.register({
          id: `hold:${o.anchor}`,
          position: () => this.anchorPoint(o.anchor),
          key: o.key ?? "F",
          prompt: o.prompt,
          holdTime: o.time,
          enabled: () => !this.busy,
          onInteract: () => void this.completeObjective(),
        });
        break;
      }
      case "reach":
        break;
    }
  }

  private async runDialogueObjective(dialogue: string, npc: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    await this.host.playDialogue(dialogue, npc);
    this.busy = false;
    await this.completeObjective();
  }

  private async runMinigame(kind: Parameters<MissionHost["startMinigame"]>[0]): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.clearRegistrations();
    const ok = await this.host.startMinigame(kind);
    this.busy = false;
    if (ok) await this.completeObjective();
    else this.setupObjective();
  }

  /** Per-frame checks for proximity objectives. */
  update(): void {
    const o = this.objective;
    if (!o || this.busy) return;
    if (o.type === "reach") {
      const a = this.host.anchor(o.anchor);
      const p = this.host.playerPosition();
      if (a && Math.hypot(a.x - p.x, a.z - p.z) < o.radius && Math.abs(a.y - p.y) < 6) void this.completeObjective();
    } else if (o.type === "minigame" && o.autoRadius) {
      const a = this.host.anchor(o.anchor);
      const p = this.host.playerPosition();
      if (a && Math.hypot(a.x - p.x, a.z - p.z) < o.autoRadius) void this.runMinigame(o.minigame);
    }
  }

  private async completeObjective(): Promise<void> {
    const m = this.current;
    if (!m) return;
    this.objectiveIndex++;
    this.progress = 0;
    this.done.clear();
    if (this.objectiveIndex < m.objectives.length) {
      this.host.notify("objective", this.objectiveText());
      this.setupObjective();
      return;
    }
    // Mission complete.
    this.clearRegistrations();
    this.busy = true;
    for (const h of m.onComplete ?? []) this.host.runHook(h, "complete");
    this.save.completeMission(this.data.scenario, m.id, m.nextMission);
    gameEvents.emit("mission:completed", { scenarioId: this.data.scenario, missionId: m.id });
    this.host.notify("complete", m.title, m.reward.text);
    this.onChanged?.();
    if (m.outro) await this.host.playDialogue(m.outro);
    this.busy = false;
    if (m.nextMission) {
      await this.start(m.nextMission);
    } else {
      this.current = null;
      this.onChanged?.();
      this.onScenarioComplete?.();
    }
  }

  /** Debug/QA helper: instantly completes the current objective. */
  debugCompleteObjective(): void {
    void this.completeObjective();
  }
}
