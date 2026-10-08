import { PBRMaterial, Vector3 } from "@babylonjs/core";
import * as K from "../../assets/PrefabsKayseri";
import type { GameServices } from "../../core/GameServices";
import { LOOKS, type HumanoidLook } from "../../entities/HumanoidFactory";
import type { NPC } from "../../entities/NPC";
import type { BaseMinigame } from "../../minigames/BaseMinigame";
import { MantiMinigame } from "../../minigames/MantiMinigame";
import { PazarlikMinigame, type Customer } from "../../minigames/PazarlikMinigame";
import { SacMinigame } from "../../minigames/SacMinigame";
import type { MinigameKind } from "../../missions/types";
import type { AtmospherePhase } from "../../rendering/Atmosphere";
import { SKY_PRESETS } from "../../rendering/SkyModel";
import { wait } from "../../utils/async";
import { clamp, easeInOutCubic } from "../../utils/math";
import { FpsScenario, type CarrySpec, type IntroPath, type WorldBuildContext } from "../common/FpsScenario";
import type { ScenarioCreateOptions } from "../types";
import { buildKayseriWorld, type KayseriWorld } from "./KayseriWorld";
import { bayCenter, LAYOUT, SHOPS } from "./layout";

const SCENARIO_ID = "kayseri_pazar";

/** Bright spring late-morning over Erciyes; light falls into the arasta through its skylights. */
function lateMorning(shadows: boolean): AtmospherePhase {
  const sky = SKY_PRESETS.istanbulMorning();
  sky.sunDirection = new Vector3(0.38, 0.8, -0.46).normalize();
  // Without shadow maps the vaults cannot block the sun: keep it soft then.
  return { sky, sunIntensity: shadows ? 3.4 : 0.9, ambientIntensity: 1.4, environmentIntensity: 0.85, fogDensity: 0 };
}

const RESUME_SPAWNS: Record<string, { x: number; z: number; yaw: number }> = {
  kayseri_m01: LAYOUT.spawn,
  kayseri_m02: { x: -1.2, z: 1, yaw: Math.PI },
  kayseri_m03: { x: -1.6, z: 4.6, yaw: -Math.PI / 2 },
  kayseri_m04: { x: -1.6, z: 1.6, yaw: -Math.PI / 2 },
  kayseri_m05: { x: -1.2, z: 2, yaw: Math.PI / 2 },
  kayseri_m06: { x: -1.6, z: 2.6, yaw: -Math.PI / 2 },
  kayseri_m07: { x: -1.6, z: 1.6, yaw: -Math.PI / 2 },
  kayseri_m08: { x: 0.6, z: 26.5, yaw: 0 },
};

/** Buyers of the day (prices in akçe; `max` stays hidden — their words give it away). */
const CUSTOMERS: (Customer & { look: () => HumanoidLook })[] = [
  {
    name: "Hoca Ali",
    origin: "Tebrizli kervancı",
    order: "2 tepsi yağlama",
    narh: 16,
    open: 9,
    max: 21,
    step: 3,
    patience: 1,
    greet: "Selâmün aleyküm! Tebriz'den geldim, yol uzun, karnım aç. İki tepsi yağlama… dokuz akçe yeter mi?",
    near: "Kardeşim, kervan yolunda kese hafifler. {x} akçe vereyim.",
    high: "Vay vay! Tebriz çarşısında bu paraya deve alınır. {x} diyorum.",
    leave: "Hanın öbür ucunda da yağlama var, Allah'a emanet!",
    thanks: "Hem lezzetli hem insaflı! Tebriz'e dönünce Kayseri yağlamasını anlatacağım.",
    look: LOOKS.tebrizli,
  },
  {
    name: "Yusuf",
    origin: "Medrese talebesi",
    order: "1 sahan mantı",
    narh: 3,
    open: 2,
    max: 4,
    step: 1,
    patience: 0.65,
    greet: "Hocam ders arasında bir sahan mantı istedi. Kesemde iki akçe var…",
    near: "Gerçekten fazlası yok. {x} akçe, söz.",
    high: "Ben talebeyim usta, o kadar param yok! {x} akçe olur ancak.",
    leave: "Hocam aç kalacak… Neyse, kuru ekmekle idare ederiz.",
    thanks: "Allah razı olsun! Hocam da dua eder size.",
    look: LOOKS.talebe,
  },
  {
    name: "Osman",
    origin: "Ahi debbağ",
    order: "4 sahan mantı",
    narh: 12,
    open: 11,
    max: 14,
    step: 1,
    patience: 0.85,
    greet: "Selâm, ahi kardeşim! Dört sahan mantı. Narh on iki; on bir diyelim, bereketi bol olsun.",
    near: "Ahilikte kazanç da helal olmalı, fiyat da insaflı. {x} akçe.",
    high: "Ahi esnafı narhın üstüne bu kadar çıkmaz kardeşim! {x} akçe veririm.",
    leave: "Bekir Usta'ya söyleyeyim, çırağına ahiliği bir daha anlatsın.",
    thanks: "İşte ahi esnafı böyle olur. Eline sağlık!",
    look: () => LOOKS.ahi(1),
  },
  {
    name: "Lorenzo",
    origin: "Cenevizli tüccar",
    order: "3 tepsi yağlama",
    narh: 24,
    open: 12,
    max: 31,
    step: 4,
    patience: 0.75,
    greet: "Buon giorno! Ah, pardon — selam! Üç tepsi o meşhur yağlamadan. On iki akçe, ne dersin?",
    near: "Hmm… Cenova'da da pazarlık bilirler, amico. {x} akçe.",
    high: "Mamma mia! Bu fiyata gemi kiralarım! {x}, daha fazla değil.",
    leave: "Basta! Ben de Sivas'a giderim, orada da yemek var.",
    thanks: "Perfetto! Kayseri tüccarı hakikaten usta. Anlaştık!",
    look: LOOKS.genoese,
  },
  {
    name: "Hüsameddin",
    origin: "Kadı Efendi'nin aşçıbaşısı",
    order: "5 tepsi yağlama, 10 sahan mantı",
    narh: 70,
    open: 58,
    max: 78,
    step: 5,
    patience: 0.9,
    greet: "Kadı Efendi bugün çarşıyı teşrif edecek. Divan için beş tepsi yağlama, on sahan mantı lazım. Elli sekiz akçe veririm.",
    near: "Divanın kesesi geniştir ama hesabı da sıkıdır. {x} akçe.",
    high: "Kadı Efendi'nin aşçıbaşısına bu fiyat söylenir mi? {x} akçe, son sözüm.",
    leave: "Başka yağlamacı mı yok bu çarşıda? Var!",
    thanks: "Kadı Efendi memnun kalacak. Hayırlı alışverişler!",
    look: LOOKS.ascibasi,
  },
];

const CHATTER = {
  villager: [
    "Bu çarşıda iğneden ipliğe her şey bulunur.",
    "Tebriz kervanı dün akşam hana indi; kumaşlar, ipekler geldi.",
    "Erciyes'in karı daha erimedi, yazın da serin olur buralar.",
    "Pastırmacının önünden geçip de durmayan var mı?",
    "Kadı Efendi adaletiyle bilinir; çarşıda kimse kimseyi kandıramaz.",
  ],
  worker: ["Bu denkler Sivas'a gidecek, oradan Karadeniz'e.", "Hanın ambarı dolu, kervanlar boş dönmüyor.", "Deveye yük, bize ekmek!"],
  woman: ["Şu kumaşın rengine bak, Bursa'dan gelmiş.", "Akşama mantı yapacağım; kıymayı kasaptan alayım.", "Baharatçı bugün sumak getirmiş."],
  child: ["Develeri gördün mü? Biri bana baktı!", "Şerbetçi amca bir bardak verir mi acaba?"],
  commander: ["Kadı Efendi'nin hanında nöbetteyiz.", "Çarşıda huzur var, Allah'a şükür."],
};

/**
 * Kayseri, c. 1390 — "Ticaretin ve Pazarlığın Keşfi". A walled market: the vaulted arasta
 * and a caravanserai courtyard. The player is the apprentice of an Ahi master who sells
 * yağlama and mantı, learns the narh and honest weights, discovers bargaining and finally
 * serves Kadı Burhaneddin, who settles a merchants' quarrel with "alan razı, satan razı".
 */
export class KayseriScene extends FpsScenario<KayseriWorld> {
  private games = new Map<MinigameKind, BaseMinigame>();
  private customers: NPC[] = [];
  private custWalk: { i: number; to: [number, number]; started: number; leaving: boolean }[] = [];
  private kadi: NPC | null = null;
  private retinue: NPC[] = [];
  private hammer = 0;
  private shopkeepers = new Map<string, NPC>();

  private constructor(services: GameServices) {
    const shadows = services.save.settings.shadows && services.preset().shadows !== "off";
    super(services, {
      scenarioId: SCENARIO_ID,
      missionsPath: "data/scenarios/kayseri_pazar.json",
      atmosphere: lateMorning(shadows),
      postFx: { exposure: 1.12, contrast: 1.1, vignette: 2.4, grain: 6 },
      bounds: LAYOUT.bounds,
      music: "kayseri",
      populateText: "Çarşı esnafı dükkânlarını açıyor",
      chatter: CHATTER,
      nameplates: [
        { npc: "usta", name: "Ahi Bekir Usta", role: "Yağlamacı · ustan" },
        { npc: "muhtesib", name: "Muhtesib Nureddin Efendi", role: "Çarşı ve narh denetçisi" },
        { npc: "kadi", name: "Kadı Burhaneddin Ahmed", role: "Kadı ve hükümdar" },
        { npc: "kasap", name: "Kasap Hasan", role: "Kasap" },
      ],
    });
  }

  static create(services: GameServices, opts: ScenarioCreateOptions): Promise<KayseriScene> {
    return FpsScenario.createInstance(new KayseriScene(services), opts);
  }

  // =====================================================================  BUILD
  protected buildWorld(ctx: WorldBuildContext): Promise<KayseriWorld> {
    return buildKayseriWorld(ctx);
  }

  protected resumeSpawn(missionId: string): { x: number; z: number; yaw: number } {
    return RESUME_SPAWNS[missionId] ?? RESUME_SPAWNS.kayseri_m01;
  }

  protected introPath(): IntroPath {
    // High over the han courtyard (Erciyes behind the iwan), through the passage, down the arasta.
    const eye = this.player.eyePosition.clone();
    const fwd = this.player.forward();
    return {
      // Starts above the passage looking north (iwan with Erciyes behind), circles west of the
      // şadırvan, then dives through the passage and down the arasta.
      points: [new Vector3(-3, 9, 12), new Vector3(-7.5, 5, 19), new Vector3(-2, 2.9, 13.5), new Vector3(0, 2.5, 6), new Vector3(0, 2.4, -6), eye],
      look: [new Vector3(25, 45, 300), new Vector3(0, 3, 30), new Vector3(0, 2.2, 4), new Vector3(0, 2, -5), new Vector3(0, 1.8, -18), eye.add(fwd.scale(10))],
      duration: 11,
    };
  }

  protected override voicePitch(speaker: string): number {
    if (speaker.startsWith("Kadı")) return 0.8;
    if (speaker.startsWith("Ahi Bekir")) return 0.78;
    if (speaker === "Anlatıcı") return 0.9;
    return super.voicePitch(speaker);
  }

  // ================================================================== NPCs
  protected populate(density: number): void {
    const L = LAYOUT;
    const sx = L.arasta.streetX;
    this.spawn("worker", LOOKS.ahi(0), -4.6, -1.0, Math.PI / 2, { type: "pose", anim: "idle" }, "Ahi Bekir Usta", "usta");
    // Shopkeepers in every bay, facing the street.
    SHOPS.forEach((s, i) => {
      const zc = bayCenter(s.bay);
      const heading = s.side < 0 ? Math.PI / 2 : -Math.PI / 2;
      if (s.kind === "kapan") {
        this.spawn("elder", LOOKS.muhtesib(), sx + 1.75, L.kapan.z - 0.6, heading, { type: "pose", anim: "idle" }, "Muhtesib Nureddin Efendi", "muhtesib");
        return;
      }
      const id = s.kind === "kasap" ? "kasap" : `esnaf_${s.kind}`;
      const look = s.kind === "kasap" ? { ...LOOKS.merchant(2), apron: "#efe0cc" } : s.kind === "bakirci" ? { ...LOOKS.worker(1), apron: "#4a3a2a" } : LOOKS.merchant(i);
      const x = s.kind === "bakirci" ? s.side * 3.6 : s.side * (sx + 1.2);
      const z = s.kind === "bakirci" ? zc - 0.9 : zc + (s.kind === "kasap" ? 0.9 : 0.6);
      const anim = s.kind === "bakirci" ? "pound" : s.kind === "kasap" ? "work" : i % 3 === 0 ? "talk" : "idle";
      const npc = this.spawn("villager", look, x, z, heading, { type: "pose", anim }, s.kind === "kasap" ? "Kasap Hasan" : s.name, id);
      this.shopkeepers.set(s.kind, npc);
    });
    // Shoppers strolling up and down the arasta (kept to the street).
    const strollers = Math.max(4, Math.round(9 * density));
    for (let i = 0; i < strollers; i++) {
      const x = [-0.9, 0.9, 0, 1.4, -1.4][i % 5];
      const z0 = -16 + (i * 7) % 22;
      const woman = i % 3 === 1;
      this.spawn(woman ? "woman" : "villager", woman ? LOOKS.woman(i) : LOOKS.merchant(i + 3), x, z0, 0, { type: "patrol", points: [[x, -16.5], [x, 8.5]], index: i % 2 }, woman ? "Hanım" : "Müşteri");
    }
    // Browsers standing at shop fronts.
    for (const [x, z, h, look, role, name] of [
      [1.4, bayCenter(1) + 0.4, Math.PI / 2, LOOKS.woman(2), "woman", "Hanım"],
      [-1.5, bayCenter(2) - 0.5, -Math.PI / 2, LOOKS.merchant(5), "villager", "Müşteri"],
      [1.6, bayCenter(6) - 0.3, Math.PI / 2, LOOKS.child(1), "child", "Çocuk"],
      [-1.4, bayCenter(0) + 0.6, -Math.PI / 2, LOOKS.merchant(7), "villager", "Müşteri"],
    ] as const) {
      this.spawn(role, look, x, z, h, { type: "pose", anim: "talk" }, name);
    }
    // Caravan people in the han.
    const H = L.han;
    ([
      [-6.2, 16.6, 2.4, "talk"],
      [-6.6, 24.4, 1.2, "idle"],
      [5.9, 25.6, -1.6, "talk"],
      [10.4, 15.8, -2.8, "work"],
    ] as const).forEach(([x, z, h, anim], i) => {
      this.spawn("worker", LOOKS.worker(i), x, z, h, { type: "pose", anim }, "Kervancı");
    });
    for (let i = 0; i < Math.max(2, Math.round(5 * density)); i++) {
      this.spawn("villager", LOOKS.merchant(i + 9), -4 + i * 2, 18 + (i % 2) * 6, i, { type: "wander", cx: 0, cz: (H.z0 + H.z1) / 2, radius: 6.5 }, "Tüccar");
    }
    this.spawn("child", LOOKS.child(0), -4.5, 20, 1, { type: "wander", cx: -5, cz: 21, radius: 3 }, "Çocuk");
    for (const x of [-2.6, 2.6]) this.spawn("commander", LOOKS.sipahi(x > 0 ? 1 : 0), x, 11.6, 0, { type: "pose", anim: "guard" }, "Nöbetçi");
  }

  protected override afterPopulate(): void {
    // Sun + sky light + up to four lamps/hearth: let every material take six lights.
    for (const m of this.scene.materials) if (m instanceof PBRMaterial) m.maxSimultaneousLights = 6;
    this.services.audio.setAmbience({ camp: 0.42, wind: 0.04 });
  }

  /** Customers queue in the street north of our counter. */
  private queueCustomers(): void {
    if (this.customers.length) return;
    CUSTOMERS.forEach((c, i) => {
      const npc = this.spawn("villager", c.look(), -1.3 + (i % 2) * 0.5, 3.4 + i * 1.15, Math.PI, { type: "pose", anim: "idle" }, c.name, `cust_${i}`);
      this.customers.push(npc);
    });
  }

  private resetQueue(): void {
    this.custWalk = [];
    this.customers.forEach((n, i) => {
      n.visible = true;
      this.npcs.relocate(n, -1.3 + (i % 2) * 0.5, 3.4 + i * 1.15, Math.PI);
      n.setBehavior({ type: "pose", anim: "idle" });
    });
  }

  protected override onPlayingUpdate(dt: number): void {
    // Customers walking to the counter or away down the arasta.
    this.custWalk = this.custWalk.filter((w) => {
      const n = this.customers[w.i];
      const p = n.position;
      const arrived = !n.isMoving && Math.hypot(p.x - w.to[0], p.z - w.to[1]) < 1.0;
      if (!arrived && this.time - w.started < (w.leaving ? 20 : 8)) return true;
      if (w.leaving) n.visible = false;
      else {
        const c = this.world.counter.customer;
        this.npcs.relocate(n, c.x, c.z, -Math.PI / 2);
        n.setBehavior({ type: "pose", anim: "talk" });
        n.lookAtPlayer = true;
      }
      return false;
    });
    // The coppersmith's hammer rings through the arasta.
    this.hammer -= dt;
    if (this.hammer <= 0) {
      this.hammer = 0.42 + Math.random() * 0.3 + (Math.random() < 0.15 ? 2.5 : 0);
      this.services.audio.play("metalClank", { volume: 0.32, pitch: 1.4 + Math.random() * 0.3, at: this.world.bakirci, refDistance: 6 });
    }
  }

  private customerReady(i: number): boolean {
    return !this.custWalk.some((w) => w.i === i);
  }

  // ================================================================ minigames
  protected createMinigame(kind: MinigameKind): BaseMinigame {
    let game = this.games.get(kind);
    if (game) return game;
    const { ui, input, audio } = this.services;
    const common = { layer: ui.hud.minigameLayer, input, audio, hud: ui.hud, mobile: ui.mobile, player: this.player };
    const w = this.world;
    if (kind === "manti") {
      game = new MantiMinigame({ ...common, stand: w.dough.stand, facing: w.dough.facing, sheet: w.dough.sheet, rows: w.dough.rows });
    } else if (kind === "sac") {
      game = new SacMinigame({ ...common, fx: this.fx, stand: w.sacStand.stand, facing: w.sacStand.facing, sacs: w.sacs, light: w.hearth.light });
    } else {
      game = new PazarlikMinigame({
        ...common,
        stand: w.counter.stand,
        facing: w.counter.facing,
        customers: CUSTOMERS,
        reset: () => {
          this.queueCustomers();
          this.resetQueue();
        },
        approach: (i) => {
          const n = this.customers[i];
          const c = w.counter.customer;
          n.setBehavior({ type: "idle" });
          n.moveTo(this.npcs.context, c.x, c.z, false);
          this.custWalk.push({ i, to: [c.x, c.z], started: this.time, leaving: false });
        },
        isReady: (i) => this.customerReady(i),
        leave: (i, happy) => {
          const n = this.customers[i];
          n.lookAtPlayer = false;
          n.setBehavior({ type: "idle" });
          const to: [number, number] = happy ? [0.9, -16.5] : [1.2, -16.5];
          n.moveTo(this.npcs.context, to[0], to[1], !happy);
          this.custWalk.push({ i, to, started: this.time, leaving: true });
        },
        npc: (i) => this.customers[i] ?? null,
      });
    }
    this.games.set(kind, game);
    return game;
  }

  // ================================================================== hooks
  runHook(id: string, phase: "start" | "complete" | "resume"): void {
    const instant = phase === "resume";
    const { audio, ui } = this.services;
    const p = this.world.props;
    switch (id) {
      case "stock:ready":
        for (const f of p.flour) f.setEnabled(true);
        p.meat.setEnabled(true);
        break;
      case "manti:ready":
        p.manti.setEnabled(true);
        for (const r of this.world.dough.rows) r.setEnabled(true);
        this.world.dough.sheet.setEnabled(false);
        break;
      case "yaglama:ready":
        p.yaglama.setEnabled(true);
        break;
      case "terazi:checked":
        p.kapanTerazi.setEnabled(false);
        p.terazi.setEnabled(true);
        break;
      case "customers:queue":
        this.queueCustomers();
        break;
      case "customers:done":
        this.custWalk = [];
        for (const n of this.customers) n.visible = false;
        break;
      case "kadi:arrive":
        this.kadiArrives(instant);
        break;
      case "kadi:served":
        this.kadiArrives(true);
        p.kadiTray.setEnabled(true);
        break;
      case "dispute:start":
        this.startDispute();
        if (!instant) {
          audio.play("distantShout", { volume: 0.5 });
          ui.hud.toast("Divanın önünde bir tartışma başladı…", "info", 3600);
        }
        break;
    }
  }

  private kadiArrives(instant: boolean): void {
    const { audio, ui } = this.services;
    for (const s of this.world.props.sancaks) s.setEnabled(true);
    if (this.kadi) return;
    const L = LAYOUT;
    const dv = L.divan;
    this.kadi = this.spawn("elder", LOOKS.kadiBurhaneddin(), dv.x, dv.z + 0.7, Math.PI, { type: "scripted" }, "Kadı Burhaneddin Ahmed", "kadi");
    this.kadi.place(dv.x, this.world.divanY, dv.z + 0.7, Math.PI);
    this.kadi.anim = "sit";
    this.kadi.lookAtPlayer = false;
    this.kadi.applyTransform();
    // Retinue: guards with spears, a scribe, a standard on either side of the iwan.
    for (const x of [-2.9, 2.9]) {
      const g = this.spawn("commander", LOOKS.sipahi(x > 0 ? 1 : 0), x, L.iwan.z0 - 1.0, Math.PI, { type: "pose", anim: "guard" }, "Kadı'nın muhafızı");
      this.retinue.push(g);
    }
    const scribe = this.spawn("worker", { ...LOOKS.talebe(), kaftan: "#3a3a44" }, 1.9, dv.z + 0.3, -Math.PI * 0.75, { type: "scripted" }, "Divan kâtibi");
    scribe.place(1.9, this.world.divanY, dv.z + 0.3, -Math.PI * 0.75);
    scribe.anim = "sit";
    scribe.applyTransform();
    this.retinue.push(scribe);
    // Townspeople gather in the courtyard to see the Kadı.
    for (let i = 0; i < 6; i++) {
      const x = -5 + (i % 3) * 1.4 + (i > 2 ? 5.6 : 0);
      const z = 25.5 + (i % 2) * 0.9;
      const n = this.spawn(i % 2 ? "woman" : "villager", i % 2 ? LOOKS.woman(i + 2) : LOOKS.merchant(i + 11), x, z, 0, { type: "pose", anim: i % 3 === 0 ? "bow" : "idle" }, "Kayserili");
      this.retinue.push(n);
    }
    if (!instant) {
      audio.play("drum", { volume: 0.8 });
      window.setTimeout(() => audio.play("drum", { volume: 0.8 }), 450);
      audio.play("cheer", { volume: 0.5 });
      ui.hud.toast("Kadı Burhaneddin Ahmed hanın divanına geldi!", "info", 4200);
    }
  }

  private startDispute(): void {
    this.kadiArrives(true);
    this.queueCustomers();
    const L = LAYOUT;
    const lorenzo = this.customers[3];
    lorenzo.visible = true;
    this.npcs.relocate(lorenzo, -1.5, L.iwan.z0 - 2.1, 0.15);
    lorenzo.setBehavior({ type: "pose", anim: "point" });
    lorenzo.lookAtPlayer = false;
    const kumasci = this.shopkeepers.get("kumasci");
    if (kumasci) {
      // While the quarrel is on, E near him must reach the Kadı, not small talk.
      this.interactions.remove(`chat:${kumasci.id}`);
      this.dynamicInteractables.delete(`chat:${kumasci.id}`);
      this.npcs.relocate(kumasci, 1.5, L.iwan.z0 - 2.1, -0.15);
      kumasci.setBehavior({ type: "pose", anim: "talk" });
      kumasci.lookAtPlayer = false;
    }
    const m = this.npcs.get("muhtesib");
    if (m) {
      this.npcs.relocate(m, 3.4, L.iwan.z0 - 1.6, -0.5);
      m.setBehavior({ type: "pose", anim: "idle" });
    }
  }

  protected carrySpec(item: string): CarrySpec {
    switch (item) {
      case "flour":
        return { parts: K.heldFlourSack(), position: [0.32, -0.42, 0.72], rotation: [0.2, 0.3, 0] };
      case "meat":
        return { parts: K.heldMeat(), position: [0, -0.32, 0.5], rotation: [0.1, 0, 0] };
      case "scale":
        return { parts: K.heldScale(), position: [0.05, -0.75, 0.55], rotation: [0, 0.4, 0] };
      default:
        return { parts: K.heldTray(), position: [0, -0.46, 0.7], rotation: [0.12, 0, 0] };
    }
  }

  override setCarry(item: string | null): void {
    super.setCarry(item);
    // The shop's own scale is what gets carried to the kapan.
    if (item === "scale") this.world.props.terazi.setEnabled(false);
  }

  override onTargetDone(targetId: string): void {
    const { audio, ui } = this.services;
    const [anchor, n] = targetId.split(":");
    const p = this.world.props;
    if (anchor === "un_yeri") {
      p.flour[Math.min(p.flour.length - 1, Number(n) - 1)]?.setEnabled(true);
      audio.play("drop", { volume: 0.6 });
    } else if (anchor === "tezgah") {
      p.meat.setEnabled(true);
      audio.play("drop", { volume: 0.5 });
    } else if (anchor === "kapan") {
      p.kapanTerazi.setEnabled(true);
      audio.play("metalClank", { volume: 0.4, pitch: 1.8 });
      ui.hud.toast("Muhtesib teraziyi kapanın mühürlü ağırlıklarıyla tartıyor…", "info", 3600);
    } else if (anchor === "kadi_sofra") {
      p.kadiTray.setEnabled(true);
      audio.play("drop", { volume: 0.5 });
    }
  }

  // ===================================================================== ending
  protected async showEnding(): Promise<void> {
    const { ui, audio, save, input } = this.services;
    const L = LAYOUT;
    save.completeScenario(SCENARIO_ID);
    this.playing = false;
    this.player.controlEnabled = false;
    input.exitPointerLock();
    ui.hud.hide();
    ui.mobile.setLayout("hidden");
    ui.cinematic.setLetterbox(true);
    // Everyone content: the quarrelling merchants shake hands, the crowd cheers.
    for (const n of this.retinue) if (n.behavior.type === "pose" && n.behavior.anim !== "guard") n.setBehavior({ type: "pose", anim: "cheer" });
    this.customers[3]?.setBehavior({ type: "pose", anim: "bow" });
    this.shopkeepers.get("kumasci")?.setBehavior({ type: "pose", anim: "bow" });
    // Slow rise from the divan steps over the courtyard toward Erciyes.
    const cam = this.player.camera;
    // From the crowd in front of the iwan, rising over the courtyard toward Erciyes.
    const from = new Vector3(1.6, 2.1, L.iwan.z0 - 4.6);
    const to = new Vector3(-6.5, 7.5, 17);
    const lookFrom = new Vector3(0, 1.7, L.divan.z);
    const target0 = new Vector3(0, 1.6, L.divan.z);
    const target1 = new Vector3(60, 60, 400);
    let t = 0;
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      t += Math.min(0.1, this.scene.getEngine().getDeltaTime() / 1000);
      const k = easeInOutCubic(clamp(t / 12, 0, 1));
      cam.position.copyFrom(Vector3.Lerp(from, to, k));
      const look = Vector3.Lerp(lookFrom, target0, easeInOutCubic(clamp(t / 2.5, 0, 1)));
      cam.setTarget(Vector3.Lerp(look, target1, easeInOutCubic(clamp((t - 5) / 7, 0, 1))));
    });
    await wait(1500);
    audio.play("murmur", { volume: 0.7, pitch: 0.8 });
    ui.cinematic.showQuote("“Alan razı, satan razı.”", "Türk atasözü");
    await wait(3600);
    audio.play("cheer", { volume: 0.7 });
    audio.play("coins", { volume: 0.5 });
    await wait(3400);
    void ui.cinematic.hideQuote(1.6);
    audio.stopMusic(6);
    await ui.cinematic.fade(1, 5, true);
    ui.cinematic.showQuote(
      "Kayseri'nin hanları, bedestenleri ve çarşıları yüzyıllar boyunca İpek Yolu'nun kavşağında ticaretin kalbi oldu. Ahilik; esnafa doğru teraziyi, insaflı fiyatı ve cömertliği öğütledi.",
      `Kayseri · Kadı Burhaneddin devri · ${this.playMinutes()} dakikada tamamlandı`,
      {
        dark: true,
        actionsDelay: 5000,
        actions: this.endingButtons().map((b) => ({
          ...b,
          onClick: () => {
            void ui.cinematic.hideQuote(0.3);
            b.onClick();
          },
        })),
      },
    );
  }

  override dispose(): void {
    this.games.clear();
    void this.services.ui.cinematic.hideQuote(0);
    super.dispose();
  }
}
