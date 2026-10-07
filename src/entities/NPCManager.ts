import type { Camera, Vector3 } from "@babylonjs/core";
import { GAME_CONFIG } from "../config/gameConfig";
import type { CollisionWorld } from "../world/CollisionWorld";
import type { NavGraph } from "../world/NavGraph";
import { Random } from "../utils/random";
import type { HumanoidFactory, HumanoidLook } from "./HumanoidFactory";
import { NPC, type NpcBehavior, type NpcContext, type NpcRole } from "./NPC";

/**
 * Owns all NPCs: spawning, behaviour updates and distance LOD
 * (full anim → reduced-rate anim → frozen → hidden), plus simple pathfinding access.
 */
export class NPCManager {
  readonly npcs: NPC[] = [];
  private byId = new Map<string, NPC>();
  private rnd = new Random(53);
  private ctx: NpcContext;
  private counter = 0;

  constructor(
    private readonly factory: HumanoidFactory,
    world: CollisionWorld,
    nav: NavGraph | null,
    groundAt: (x: number, z: number, feetY: number) => number,
    player: Vector3,
  ) {
    this.ctx = { world, nav, groundAt, player, rnd: () => this.rnd.next() };
  }

  get context(): NpcContext {
    return this.ctx;
  }

  spawn(opts: { id?: string; role: NpcRole; name?: string; look: HumanoidLook; x: number; z: number; heading?: number; behavior?: NpcBehavior }): NPC {
    const id = opts.id ?? `${opts.role}-${++this.counter}`;
    const rig = this.factory.create(opts.look, id);
    const npc = new NPC(id, opts.role, opts.name ?? "", rig);
    const y = this.ctx.groundAt(opts.x, opts.z, 999);
    npc.place(opts.x, y, opts.z, opts.heading ?? 0);
    if (opts.behavior) npc.setBehavior(opts.behavior);
    this.npcs.push(npc);
    this.byId.set(id, npc);
    return npc;
  }

  get(id: string): NPC | undefined {
    return this.byId.get(id);
  }

  /** Teleports an NPC (e.g. Fatih moving between mission locations). */
  relocate(npc: NPC, x: number, z: number, heading: number): void {
    npc.place(x, this.ctx.groundAt(x, z, 999), z, heading);
  }

  remove(npc: NPC): void {
    const i = this.npcs.indexOf(npc);
    if (i >= 0) this.npcs.splice(i, 1);
    this.byId.delete(npc.id);
    this.factory.disposeRig(npc.rig);
  }

  update(dt: number, camera: Camera): void {
    const cam = camera.globalPosition;
    const maxD = GAME_CONFIG.npc.visibleDistance;
    for (const npc of this.npcs) {
      const d = Math.hypot(npc.position.x - cam.x, npc.position.z - cam.z);
      const visible = d < maxD && npc.visible;
      if (visible !== npc.rig.root.isEnabled()) npc.rig.root.setEnabled(visible);
      // Far, invisible NPCs still move along their paths (cheaply) but don't animate.
      if (!visible) {
        if (npc.isMoving && npc.behavior.type !== "scripted") npc.update(dt, this.ctx, 9999);
        continue;
      }
      npc.update(dt, this.ctx, d);
    }
  }
}
