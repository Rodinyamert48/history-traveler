import { Color4, TransformNode, Vector3, type ParticleSystem, type Scene } from "@babylonjs/core";
import type { PrefabLibrary } from "../../assets/PrefabLibrary";
import { SHIP_STYLES } from "../../assets/PrefabsCanakkale";
import type { AudioManager } from "../../audio/AudioManager";
import type { ParticleFX } from "../../systems/ParticleFX";
import { clamp, lerp } from "../../utils/math";
import { Random } from "../../utils/random";
import { LAYOUT } from "./layout";

export type ShipState = "hidden" | "steaming" | "withdrawing" | "toMines" | "sinking" | "listing" | "gone";

export interface FleetShip {
  id: string;
  name: string;
  nation: "İngiliz" | "Fransız";
  node: TransformNode;
  length: number;
  beam: number;
  hp: number;
  maxHp: number;
  state: ShipState;
  /** Steaming loop: centre, radii, angular speed and phase. */
  loop: { cx: number; cz: number; rx: number; rz: number; w: number; a: number };
  heading: number;
  speed: number;
  t: number;
  fireCd: number;
  smoke: ParticleSystem | null;
  burning: ParticleSystem | null;
}

interface ShipDef {
  id: string;
  name: string;
  nation: "İngiliz" | "Fransız";
  style: keyof typeof SHIP_STYLES;
  hp: number;
}

const SHIPS: ShipDef[] = [
  { id: "qe", name: "Queen Elizabeth", nation: "İngiliz", style: "britishBig", hp: 3 },
  { id: "agamemnon", name: "Agamemnon", nation: "İngiliz", style: "british", hp: 2 },
  { id: "nelson", name: "Lord Nelson", nation: "İngiliz", style: "british", hp: 2 },
  { id: "inflexible", name: "Inflexible", nation: "İngiliz", style: "britishBig", hp: 3 },
  { id: "bouvet", name: "Bouvet", nation: "Fransız", style: "french3", hp: 3 },
  { id: "suffren", name: "Suffren", nation: "Fransız", style: "french", hp: 2 },
  { id: "gaulois", name: "Gaulois", nation: "Fransız", style: "french", hp: 2 },
  { id: "charlemagne", name: "Charlemagne", nation: "Fransız", style: "french3", hp: 2 },
  { id: "irresistible", name: "Irresistible", nation: "İngiliz", style: "british", hp: 2 },
  { id: "ocean", name: "Ocean", nation: "İngiliz", style: "british", hp: 2 },
];

/** Steaming loops (x, z, rx, rz) in the lower strait and Erenköy Bay. */
const LOOPS_FAR: [number, number, number, number][] = [
  [300, -780, 60, 22],
  [410, -810, 60, 22],
  [520, -770, 60, 22],
  [360, -860, 60, 22],
];
const LOOPS_A: [number, number, number, number][] = [
  [270, -560, 56, 20],
  [370, -610, 56, 20],
  [470, -570, 56, 20],
  [330, -670, 56, 20],
];
const LOOPS_FINAL: Record<string, [number, number, number, number]> = {
  bouvet: [420, -430, 46, 18],
  suffren: [330, -380, 46, 18],
  gaulois: [300, -470, 46, 18],
  charlemagne: [390, -520, 46, 18],
  irresistible: [480, -560, 50, 20],
  ocean: [560, -600, 50, 20],
  inflexible: [460, -660, 50, 20],
};

/**
 * The Allied fleet on the water: ships steaming round their firing loops, firing at the
 * shore, withdrawing when damaged, and — on 18 March — Bouvet, Irresistible and Ocean running
 * onto Nusret's mines in Erenköy Bay.
 */
export class CanakkaleFleet {
  readonly ships: FleetShip[] = [];
  /** Ships fire at the battery (cosmetic outside the final; the minigame takes damage). */
  bombard = false;
  /** Called when a volley lands near the battery: point and distance from the battery centre. */
  onIncoming: ((at: Vector3, dist: number) => void) | null = null;
  /** Called when a ship strikes a mine. */
  onMine: ((ship: FleetShip) => void) | null = null;
  private rnd = new Random(318);
  private pending: { t: number; at: Vector3 }[] = [];

  constructor(
    private readonly scene: Scene,
    prefabs: PrefabLibrary,
    private readonly fx: ParticleFX,
    private readonly audio: AudioManager,
  ) {
    for (const d of SHIPS) {
      const st = SHIP_STYLES[d.style];
      const node = new TransformNode(`fleet-${d.id}`, scene);
      prefabs.place(`ship-${d.style}`, 0, 0, 0, { parent: node });
      node.setEnabled(false);
      this.ships.push({
        id: d.id,
        name: d.name,
        nation: d.nation,
        node,
        length: st.length,
        beam: st.beam,
        hp: d.hp,
        maxHp: d.hp,
        state: "hidden",
        loop: { cx: 0, cz: 0, rx: 1, rz: 1, w: 0, a: 0 },
        heading: 0,
        speed: 0,
        t: 0,
        fireCd: 4,
        smoke: null,
        burning: null,
      });
    }
  }

  get(id: string): FleetShip {
    return this.ships.find((s) => s.id === id)!;
  }

  /** Ships that can be fired at. */
  get active(): FleetShip[] {
    return this.ships.filter((s) => s.state === "steaming" || s.state === "toMines");
  }

  private steam(s: FleetShip, loop: [number, number, number, number], phase: number): void {
    const [cx, cz, rx, rz] = loop;
    s.loop = { cx, cz, rx, rz, w: 4.5 / Math.max(rx, rz), a: phase };
    s.state = "steaming";
    s.hp = s.maxHp;
    s.node.setEnabled(true);
    s.node.position.y = 0;
    s.node.rotation.set(0, 0, 0);
    if (s.burning) {
      s.burning.stop();
      s.burning = null;
    }
    if (!s.smoke) s.smoke = this.fx.smokeColumn(new Vector3(0, 14, 0), 0.9);
    this.place(s, 0);
  }

  private hide(s: FleetShip): void {
    s.state = "hidden";
    s.node.setEnabled(false);
    s.smoke?.stop();
    s.smoke = null;
    s.burning?.stop();
    s.burning = null;
  }

  /**
   * Fleet set-ups: "approach" = line A far down the strait; "first" = line A in its firing
   * positions; "final" = the French line and the British reserve close in for the afternoon.
   */
  prepare(stage: "approach" | "first" | "final"): void {
    const lineA = ["qe", "agamemnon", "nelson", "inflexible"];
    if (stage === "approach" || stage === "first") {
      for (const s of this.ships) if (!lineA.includes(s.id)) this.hide(s);
      lineA.forEach((id, i) => this.steam(this.get(id), (stage === "approach" ? LOOPS_FAR : LOOPS_A)[i], i * 1.6));
      return;
    }
    for (const s of this.ships) {
      const loop = LOOPS_FINAL[s.id];
      if (loop) this.steam(s, loop, this.rnd.range(0, 6.28));
      else this.hide(s);
    }
  }

  /** Lead position of a ship `ahead` seconds from now (for steaming ships). */
  predict(s: FleetShip, ahead: number): Vector3 {
    if (s.state !== "steaming") return s.node.position.clone();
    const a = s.loop.a + s.loop.w * ahead;
    return new Vector3(s.loop.cx + Math.cos(a) * s.loop.rx, 0, s.loop.cz + Math.sin(a) * s.loop.rz);
  }

  /** A hit from the battery. Returns true when the ship is knocked out of the line. */
  hit(s: FleetShip): boolean {
    s.hp--;
    const p = s.node.position;
    this.fx.impact(new Vector3(p.x, 7, p.z), true);
    if (!s.burning) s.burning = this.fx.smokeColumn(new Vector3(p.x, 6, p.z), 1.6);
    if (s.hp > 0) return false;
    if (s.state === "steaming") this.withdraw(s);
    return true;
  }

  withdraw(s: FleetShip): void {
    if (s.state !== "steaming" && s.state !== "toMines") return;
    s.state = "withdrawing";
    s.t = 0;
  }

  /** Every ship still in action turns away down the strait. */
  retreatAll(): void {
    for (const s of this.ships) if (s.state === "steaming") this.withdraw(s);
  }

  /** Sends a ship into Erenköy Bay, onto the minefield. */
  toMines(id: string): void {
    const s = this.get(id);
    if (s.state === "hidden" || s.state === "gone" || s.state === "sinking") return;
    s.node.setEnabled(true);
    s.state = "toMines";
    s.t = 0;
  }

  /** Mine strike: Bouvet capsizes and sinks within minutes; the others take a list and stop. */
  private mine(s: FleetShip): void {
    const p = s.node.position;
    s.state = s.id === "bouvet" ? "sinking" : "listing";
    s.t = 0;
    const at = new Vector3(p.x, 1, p.z);
    for (let k = 0; k < 4; k++) this.fx.splash(at.add(new Vector3(this.rnd.range(-10, 10), 0, this.rnd.range(-10, 10))));
    this.fx.impact(new Vector3(p.x, 4, p.z), true);
    s.burning?.stop();
    s.burning = this.fx.smokeColumn(new Vector3(p.x, 4, p.z), s.id === "bouvet" ? 3 : 2.2);
    this.audio.play("cannonFire", { volume: 0.9, pitch: 0.5 });
    this.audio.play("impactStone", { volume: 0.6, pitch: 0.6 });
    this.onMine?.(s);
  }

  private place(s: FleetShip, dt: number): void {
    const l = s.loop;
    l.a += l.w * dt;
    const x = l.cx + Math.cos(l.a) * l.rx;
    const z = l.cz + Math.sin(l.a) * l.rz;
    // Heading along the loop's tangent (counter-clockwise in x/z).
    const tx = -Math.sin(l.a) * l.rx;
    const tz = Math.cos(l.a) * l.rz;
    s.heading = Math.atan2(tx, tz);
    s.node.position.set(x, 0, z);
    s.node.rotation.y = s.heading;
  }

  private moveTo(s: FleetShip, tx: number, tz: number, speed: number, dt: number): number {
    const p = s.node.position;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let dh = want - s.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    s.heading += clamp(dh, -0.25 * dt, 0.25 * dt);
    p.x += Math.sin(s.heading) * speed * dt;
    p.z += Math.cos(s.heading) * speed * dt;
    s.node.rotation.y = s.heading;
    return d;
  }

  update(dt: number, battery: Vector3): void {
    const mf = LAYOUT.minefield;
    for (const s of this.ships) {
      if (s.state === "hidden" || s.state === "gone") continue;
      s.t += dt;
      if (s.state === "steaming") this.place(s, dt);
      else if (s.state === "withdrawing") {
        this.moveTo(s, s.node.position.x - 60, -1500, 7, dt);
        if (s.node.position.z < -1250) this.hide(s);
      } else if (s.state === "toMines") {
        const d = this.moveTo(s, mf.x, mf.z, 8, dt);
        if (d < 18) this.mine(s);
      } else if (s.state === "sinking") {
        // Over on her side and down by the stern in under a minute.
        const k = clamp(s.t / 26, 0, 1);
        s.node.rotation.z = lerp(0, 1.7, Math.min(1, k * 1.6));
        s.node.rotation.x = lerp(0, -0.35, k);
        s.node.position.y = lerp(0, -26, k * k);
        if (k >= 1) {
          s.state = "gone";
          s.node.setEnabled(false);
          s.smoke?.stop();
          s.smoke = null;
        }
      } else if (s.state === "listing") {
        const k = clamp(s.t / 10, 0, 1);
        s.node.rotation.z = lerp(0, 0.22, k);
        s.node.position.y = lerp(0, -1.6, k);
      }
      // Funnel smoke and the fire on deck follow the ship.
      const p = s.node.position;
      if (s.smoke) (s.smoke.emitter as Vector3).set(p.x, p.y + 15, p.z);
      if (s.burning) (s.burning.emitter as Vector3).set(p.x, Math.max(1, p.y + 6), p.z);
      // Broadsides at the shore.
      if (this.bombard && s.state === "steaming") {
        s.fireCd -= dt;
        if (s.fireCd <= 0) {
          s.fireCd = this.rnd.range(6, 11);
          const muzzle = new Vector3(p.x, 6, p.z);
          const dir = battery.subtract(muzzle).normalize();
          this.fx.muzzleFlash(muzzle.add(dir.scale(s.beam)), dir);
          this.fx.cannonSmoke(muzzle.add(dir.scale(s.beam)), dir);
          const dist = Vector3.Distance(muzzle, battery);
          const delay = dist / 340;
          window.setTimeout(() => this.audio.play("cannonFire", { volume: 0.35, pitch: 0.7 + this.rnd.range(0, 0.15) }), delay * 1000);
          // The shell lands a few seconds later somewhere around the battery.
          const a = this.rnd.range(0, Math.PI * 2);
          const r = this.rnd.range(14, 80);
          this.pending.push({ t: 2.4 + this.rnd.range(0, 1.2), at: new Vector3(battery.x + Math.cos(a) * r, 0, battery.z + Math.sin(a) * r) });
        }
      }
    }
    this.pending = this.pending.filter((q) => {
      q.t -= dt;
      if (q.t > 0) return true;
      const d = Math.hypot(q.at.x - battery.x, q.at.z - battery.z);
      this.onIncoming?.(q.at, d);
      return false;
    });
  }

  /** Dust tint for shell bursts on the hillside. */
  static readonly DUST = new Color4(0.62, 0.52, 0.38, 0.9);

  dispose(): void {
    for (const s of this.ships) {
      s.smoke?.stop();
      s.burning?.stop();
    }
    this.pending = [];
    void this.scene;
  }
}
