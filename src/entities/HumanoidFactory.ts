import { Color4, Matrix, TransformNode, type InstancedMesh, type Mesh, type Scene } from "@babylonjs/core";
import { GeoBuilder, hexColor, type RGBA } from "../assets/GeoBuilder";
import type { MaterialKey, MaterialLibrary } from "../rendering/MaterialLibrary";
import { registerInstancedBufferWithCapacity } from "../rendering/instancing";
import type { RenderPipeline } from "../rendering/RenderPipeline";

export type HatKind = "bork" | "turban" | "kavuk" | "helmet" | "cap" | "byzHelmet" | "yazma" | "keche" | "fes" | "kalpak" | "kabalak" | "bashlik" | "none";
export type ItemKind = "spear" | "shield" | "hammer" | "mallet" | "paddle" | "davulStick" | "zurna" | "rifle" | "none";

export interface HumanoidLook {
  skin: string;
  kaftan: string;
  sleeves: string;
  trousers: string;
  sash: string;
  boots: string;
  hat: HatKind;
  hatColor: string;
  hatAccent?: string;
  beard?: string;
  longKaftan: boolean;
  scale?: number;
  rightItem?: ItemKind;
  leftItem?: ItemKind;
  collar?: string;
  /** Apron (önlük) colour over the dress/şalvar. */
  apron?: string;
  /** Davul hung across the chest (wedding musicians). */
  davul?: boolean;
  mustache?: string;
  /** Leather cross-belt / cartridge bandolier over the chest. */
  bandolier?: string;
}

const LOOKS_BASE_MUSICIAN: HumanoidLook = {
  skin: "#b98660",
  kaftan: "#8a1f1f",
  sleeves: "#efe6d2",
  trousers: "#2f2a26",
  sash: "#d6a540",
  boots: "#3a2a1c",
  hat: "keche",
  hatColor: "#3a2e24",
  beard: "#2b2018",
  longKaftan: false,
};

export const LOOKS = {
  janissary: (v = 0): HumanoidLook => ({
    skin: ["#c99a72", "#b98660", "#d4a882"][v % 3],
    kaftan: ["#2c4a75", "#8a1f1f", "#2c4a75", "#3d5a35"][v % 4],
    sleeves: "#a32020",
    trousers: "#2a3550",
    sash: "#d6a540",
    boots: "#c9a03a",
    hat: "bork",
    hatColor: "#efe8d8",
    hatAccent: "#d6a540",
    beard: v % 3 === 0 ? undefined : "#2b2018",
    longKaftan: true,
    rightItem: v % 2 === 0 ? "spear" : "none",
  }),
  sipahi: (v = 0): HumanoidLook => ({
    skin: "#c49470",
    kaftan: ["#7d1418", "#5a2a6a"][v % 2],
    sleeves: "#c9a03a",
    trousers: "#3a2a1c",
    sash: "#e0c060",
    boots: "#5a3a20",
    hat: "helmet",
    hatColor: "#8f8a80",
    hatAccent: "#b3141c",
    beard: "#241a12",
    longKaftan: true,
    rightItem: "spear",
    leftItem: v % 2 ? "shield" : "none",
  }),
  worker: (v = 0): HumanoidLook => ({
    skin: ["#c08a64", "#a8764f", "#d0a07a"][v % 3],
    kaftan: ["#8a6a48", "#6e5a40", "#9a8060"][v % 3],
    sleeves: "#d9cdb2",
    trousers: "#5a4a38",
    sash: "#7a2a20",
    boots: "#4a3524",
    hat: v % 2 ? "turban" : "cap",
    hatColor: v % 2 ? "#e8e0cc" : "#8a2a20",
    beard: v % 2 ? "#3a2a1c" : undefined,
    longKaftan: false,
    rightItem: v % 3 === 0 ? "hammer" : "none",
  }),
  sailor: (v = 0): HumanoidLook => ({
    skin: "#b98660",
    kaftan: ["#2f5f8f", "#e6dcc6"][v % 2],
    sleeves: "#e6dcc6",
    trousers: "#2a3a5a",
    sash: "#a8261f",
    boots: "#3a2a1c",
    hat: "cap",
    hatColor: "#a8261f",
    beard: v % 2 ? "#2b2018" : undefined,
    longKaftan: false,
  }),
  gunner: (v = 0): HumanoidLook => ({
    skin: "#b98660",
    kaftan: "#6a1c16",
    sleeves: "#3a2a1c",
    trousers: "#3a2a1c",
    sash: "#8a6a3a",
    boots: "#3a2a1c",
    hat: "turban",
    hatColor: v % 2 ? "#d8cfb8" : "#c9b48a",
    beard: "#2b2018",
    longKaftan: false,
  }),
  byzantine: (v = 0): HumanoidLook => ({
    skin: "#d2a684",
    kaftan: ["#5a1f3a", "#3a3f6a", "#6a2a2a"][v % 3],
    sleeves: "#8f8a80",
    trousers: "#3a3530",
    sash: "#c9a03a",
    boots: "#3a2a1c",
    hat: "byzHelmet",
    hatColor: "#9a958c",
    hatAccent: "#c9a03a",
    beard: v % 2 ? "#3a2a1c" : undefined,
    longKaftan: false,
    rightItem: "spear",
    leftItem: "shield",
  }),
  commander: (): HumanoidLook => ({
    skin: "#c49470",
    kaftan: "#1f5a3a",
    sleeves: "#d6a540",
    trousers: "#2a2a2a",
    sash: "#d6a540",
    boots: "#7a1a1a",
    hat: "turban",
    hatColor: "#f4efe4",
    hatAccent: "#2f7a3a",
    beard: "#3a2a1c",
    longKaftan: true,
    collar: "#6a4a2a",
  }),
  // --------------------------------------------------------- Muğla / Menteşe villagers
  villager: (v = 0): HumanoidLook => ({
    skin: ["#c08a64", "#b07a54", "#cf9e78", "#a87450"][v % 4],
    kaftan: ["#7a5236", "#5d4a3a", "#8a6a3e", "#4f5a3a", "#6e3a28"][v % 5],
    sleeves: ["#e9e1cf", "#d8ccb0", "#efe6d2"][v % 3],
    trousers: ["#2f2a26", "#4a3a2c", "#3a3a44"][v % 3],
    sash: ["#a8261f", "#c4862a", "#7a2a40"][v % 3],
    boots: "#3a2a1c",
    hat: v % 3 === 2 ? "turban" : "keche",
    hatColor: v % 3 === 2 ? "#e8e0cc" : ["#6a4a30", "#3a2e24", "#8a6a48"][v % 3],
    beard: v % 2 ? "#2b2018" : undefined,
    longKaftan: false,
    rightItem: "none",
  }),
  woman: (v = 0): HumanoidLook => ({
    skin: ["#d2a684", "#c49470", "#dcb08e"][v % 3],
    kaftan: ["#8e2a2a", "#2e4f6e", "#6a3a5a", "#3f6a4a", "#9a5a2a"][v % 5],
    sleeves: "#efe6d2",
    trousers: ["#7a2a2a", "#4a3a5a", "#6e4a2a"][v % 3],
    sash: ["#d6a540", "#c43a2a", "#e0c070"][v % 3],
    boots: "#4a3020",
    // Muğla women's yazma: white tülbent with coloured hand-printed borders.
    hat: "yazma",
    hatColor: ["#f2ece0", "#e8d9b8", "#f0e4d4"][v % 3],
    longKaftan: true,
    apron: v % 2 ? "#e9dfc8" : undefined,
    scale: 0.94,
  }),
  child: (v = 0): HumanoidLook => ({
    skin: ["#d2a684", "#c49470"][v % 2],
    kaftan: ["#b0482a", "#3a6a8a", "#c49a2a", "#6a8a3a"][v % 4],
    sleeves: "#efe6d2",
    trousers: "#4a3a2c",
    sash: "#d6a540",
    boots: "#4a3020",
    hat: v % 2 ? "keche" : "none",
    hatColor: "#8a2a20",
    longKaftan: false,
    scale: 0.66,
  }),
  aysheNine: (): HumanoidLook => ({
    skin: "#c9987a",
    kaftan: "#5a2a3a",
    sleeves: "#efe6d2",
    trousers: "#4a2a2a",
    sash: "#c4862a",
    boots: "#3a2418",
    hat: "yazma",
    hatColor: "#faf6ee",
    longKaftan: true,
    apron: "#efe6d2",
    scale: 0.92,
  }),
  elder: (): HumanoidLook => ({
    skin: "#c08a64",
    kaftan: "#3a4a5a",
    sleeves: "#e9e1cf",
    trousers: "#2a2a30",
    sash: "#b3141c",
    boots: "#2a1c14",
    hat: "turban",
    hatColor: "#f4efe4",
    beard: "#d8d2c6",
    longKaftan: true,
    collar: "#5a3a24",
  }),
  musician: (v = 0): HumanoidLook => ({
    ...LOOKS_BASE_MUSICIAN,
    kaftan: ["#8a1f1f", "#2c4a75"][v % 2],
    rightItem: v % 2 === 0 ? "davulStick" : "zurna",
    davul: v % 2 === 0,
  }),
  // ------------------------------------------------------------ Ankara 1920
  /** Mebus (deputy): suits and coats with fes, kalpak or a cleric's sarık. */
  deputy: (v = 0): HumanoidLook => {
    const hat = (["fes", "kalpak", "turban", "fes", "kalpak", "none"] as const)[v % 6];
    const cleric = hat === "turban";
    return {
      skin: ["#c99a72", "#b98660", "#d4a882", "#c08a64"][v % 4],
      kaftan: cleric ? ["#3a3a44", "#2a3a2e"][v % 2] : ["#2a2a2e", "#3a3530", "#2c3444", "#4a4038", "#33302c"][v % 5],
      sleeves: cleric ? "#3a3a44" : ["#2a2a2e", "#3a3530", "#2c3444", "#4a4038", "#33302c"][v % 5],
      trousers: "#25252a",
      sash: cleric ? "#e8e0cc" : "#1c1c1e",
      boots: "#1a1614",
      hat,
      hatColor: hat === "fes" ? "#9e1a1f" : hat === "kalpak" ? ["#2e2a26", "#4a4440", "#1e1c1a"][v % 3] : "#f2ede2",
      beard: v % 3 === 0 ? ["#2b2018", "#8a8478", "#d8d2c6"][v % 3] : undefined,
      mustache: ["#2b2018", "#3a2a1c", "#8a8478"][v % 3],
      longKaftan: cleric || v % 4 === 1,
      collar: "#efe8dc",
    };
  },
  /** Kuvâ-yi Milliye soldier guarding the building. */
  soldier1920: (v = 0): HumanoidLook => ({
    skin: ["#c08a64", "#b07a54"][v % 2],
    kaftan: "#6b6748",
    sleeves: "#6b6748",
    trousers: "#5a5640",
    sash: "#4a3a24",
    boots: "#2a2018",
    hat: "kalpak",
    hatColor: "#2e2a26",
    mustache: "#2b2018",
    longKaftan: false,
    rightItem: "rifle",
  }),
  clerk1920: (v = 0): HumanoidLook => ({
    skin: ["#c99a72", "#d4a882"][v % 2],
    kaftan: ["#3a3530", "#2c3444"][v % 2],
    sleeves: ["#3a3530", "#2c3444"][v % 2],
    trousers: "#2a2a2e",
    sash: "#1c1c1e",
    boots: "#1a1614",
    hat: "fes",
    hatColor: "#9e1a1f",
    mustache: "#2b2018",
    longKaftan: false,
    collar: "#efe8dc",
  }),
  /** Mustafa Kemal Paşa in April 1920: grey kalpak and a long grey coat. */
  mustafaKemal: (): HumanoidLook => ({
    skin: "#e0b898",
    kaftan: "#55534e",
    sleeves: "#55534e",
    trousers: "#2e2e30",
    sash: "#2e2e30",
    boots: "#141210",
    hat: "kalpak",
    hatColor: "#6a6660",
    mustache: "#b89a72",
    longKaftan: true,
    collar: "#efe8dc",
    scale: 1.04,
  }),
  // ------------------------------------------------------------ Samsun, May 1919
  /** Ottoman infantryman of 1919: khaki tunic, kabalak, puttees, leather belts, Mauser. */
  asker1919: (v = 0): HumanoidLook => ({
    skin: ["#c08a64", "#b07a54", "#cf9e78", "#a87450"][v % 4],
    kaftan: ["#7a7452", "#726c4c", "#807a58"][v % 3],
    sleeves: ["#7a7452", "#726c4c", "#807a58"][v % 3],
    trousers: "#6a6446",
    sash: "#4a3622",
    boots: "#3a2a1c",
    hat: "kabalak",
    hatColor: ["#8a8460", "#827c58"][v % 2],
    mustache: v % 3 === 2 ? undefined : "#2b2018",
    longKaftan: false,
    bandolier: "#5a4028",
    rightItem: v % 2 === 0 ? "rifle" : "none",
  }),
  /** Ottoman officer of 1919: kalpak, belted tunic, high boots. */
  subay1919: (v = 0): HumanoidLook => ({
    skin: ["#c99a72", "#d4a882"][v % 2],
    kaftan: "#6e6a50",
    sleeves: "#6e6a50",
    trousers: "#5a5642",
    sash: "#3a2a1c",
    boots: "#1e1610",
    hat: "kalpak",
    hatColor: ["#2e2a26", "#5a5650"][v % 2],
    mustache: "#2b2018",
    longKaftan: false,
    collar: "#8a2a2a",
    bandolier: "#3a2a1c",
  }),
  /** Mustafa Kemal Paşa in Samsun, May 1919: grey kalpak, khaki-grey uniform. */
  mustafaKemal1919: (): HumanoidLook => ({
    skin: "#e0b898",
    kaftan: "#66624e",
    sleeves: "#66624e",
    trousers: "#4a473a",
    sash: "#2a2018",
    boots: "#141210",
    hat: "kalpak",
    hatColor: "#7a766e",
    mustache: "#b89a72",
    longKaftan: true,
    collar: "#8a2a2a",
    scale: 1.04,
  }),
  /** Leader of an armed band in the Pontic hills: black clothes, kerchief, cartridge belts. */
  ceteReisi: (): HumanoidLook => ({
    skin: "#c49470",
    kaftan: "#1e1c1e",
    sleeves: "#2a2628",
    trousers: "#1a1818",
    sash: "#7a1a1a",
    boots: "#2a1c14",
    hat: "bashlik",
    hatColor: "#141214",
    mustache: "#1c1814",
    beard: "#1c1814",
    longKaftan: false,
    bandolier: "#6a4a2a",
    scale: 1.08,
  }),
  // ------------------------------------------------------------ Kayseri c. 1390
  /** Kadı Burhaneddin Ahmed: scholar-ruler, great white kavuk, green robe with a fur collar. */
  kadiBurhaneddin: (): HumanoidLook => ({
    skin: "#cfa07c",
    kaftan: "#24503a",
    sleeves: "#c9a03a",
    trousers: "#2a2420",
    sash: "#e2b84f",
    boots: "#5a2a1a",
    hat: "kavuk",
    hatColor: "#f7f2e6",
    hatAccent: "#24503a",
    beard: "#3a2c20",
    longKaftan: true,
    collar: "#7a5a3a",
    scale: 1.04,
  }),
  /** Ahi master: white felt börk, apron over a plain robe. */
  ahi: (v = 0): HumanoidLook => ({
    skin: ["#c08a64", "#b98660"][v % 2],
    kaftan: ["#6a4a30", "#5a5040"][v % 2],
    sleeves: "#e9e1cf",
    trousers: "#3a3028",
    sash: "#b8862e",
    boots: "#3a2a1c",
    hat: "keche",
    hatColor: "#efe8d8",
    beard: ["#8a8478", "#2b2018"][v % 2],
    longKaftan: false,
    apron: "#efe6d2",
  }),
  /** Bazaar merchants and shopkeepers. */
  merchant: (v = 0): HumanoidLook => ({
    skin: ["#c99a72", "#b98660", "#d4a882", "#c08a64"][v % 4],
    kaftan: ["#7a2a2a", "#2e4a6e", "#5a4a2a", "#3f5a3a", "#6a3a5a"][v % 5],
    sleeves: ["#d9cdb2", "#c9a03a", "#e9e1cf"][v % 3],
    trousers: ["#2f2a26", "#3a3a44"][v % 2],
    sash: ["#c4862a", "#a8261f", "#e0c070"][v % 3],
    boots: "#3a2a1c",
    hat: (["turban", "keche", "turban", "cap"] as const)[v % 4],
    hatColor: ["#efe8d8", "#6a4a30", "#e8dcc0", "#8a1f1f"][v % 4],
    beard: v % 3 === 1 ? undefined : ["#2b2018", "#3a2a1c", "#8a8478"][v % 3],
    longKaftan: v % 2 === 0,
  }),
  /** Muhtesib: market inspector of weights and prices, dark robe and turban. */
  muhtesib: (): HumanoidLook => ({
    skin: "#c49470",
    kaftan: "#2e2a3a",
    sleeves: "#2e2a3a",
    trousers: "#1e1c22",
    sash: "#c9a03a",
    boots: "#1a1614",
    hat: "turban",
    hatColor: "#f4efe4",
    beard: "#4a3a2a",
    longKaftan: true,
    collar: "#5a4a3a",
  }),
  /** Persian caravan merchant from Tabriz: large turban, blue robe. */
  tebrizli: (): HumanoidLook => ({
    skin: "#c8946c",
    kaftan: "#1f4f7a",
    sleeves: "#e8d8b8",
    trousers: "#2a2a3a",
    sash: "#d6a540",
    boots: "#4a2a1a",
    hat: "turban",
    hatColor: "#e9dcc0",
    beard: "#1c1814",
    longKaftan: true,
    scale: 1.02,
  }),
  /** Genoese merchant: red cap, long dark gown, shaven. */
  genoese: (): HumanoidLook => ({
    skin: "#e0b898",
    kaftan: "#3a2430",
    sleeves: "#7a1a24",
    trousers: "#2a1e22",
    sash: "#1c1418",
    boots: "#1a1210",
    hat: "cap",
    hatColor: "#9e1a1f",
    longKaftan: true,
    collar: "#e8e0d0",
  }),
  /** Medrese student: small white sarık, plain robe. */
  talebe: (): HumanoidLook => ({
    skin: "#d4a882",
    kaftan: "#8a7a5a",
    sleeves: "#e9e1cf",
    trousers: "#4a3a2c",
    sash: "#e8e0cc",
    boots: "#4a3020",
    hat: "turban",
    hatColor: "#f2ede2",
    longKaftan: true,
    scale: 0.95,
  }),
  /** The Kadı's head cook. */
  ascibasi: (): HumanoidLook => ({
    skin: "#c08a64",
    kaftan: "#e8dcc0",
    sleeves: "#e8dcc0",
    trousers: "#3a3028",
    sash: "#8e1a20",
    boots: "#3a2a1c",
    hat: "cap",
    hatColor: "#f2ede2",
    beard: "#2b2018",
    longKaftan: false,
    apron: "#f6f2ea",
    scale: 1.06,
  }),
  // -------------------------------------------------------------- Bursa 1326
  /** Orhan Gazi: tall white kavuk-like sarık, dark green kaftan with a fur collar, full dark beard. */
  orhanGazi: (): HumanoidLook => ({
    skin: "#c99a72",
    kaftan: "#1f4a3a",
    sleeves: "#b8862e",
    trousers: "#2a2420",
    sash: "#d6a540",
    boots: "#6a1a1a",
    hat: "kavuk",
    hatColor: "#f4efe4",
    hatAccent: "#1f4a3a",
    beard: "#241a14",
    longKaftan: true,
    collar: "#6a4a2e",
    scale: 1.06,
  }),
  /** Frontier gazis (alps): white felt börk or sarık, plain short kaftans. */
  gazi: (n = 0): HumanoidLook => {
    const v = Math.abs(Math.round(n));
    return {
      skin: ["#c08a64", "#b98660", "#cf9e78", "#a87450"][v % 4],
      kaftan: ["#6a3a28", "#3f5a3a", "#5a4a2a", "#7a2a2a", "#3a4a5a"][v % 5],
      sleeves: ["#d8ccb0", "#a87a4a", "#e9e1cf"][v % 3],
      trousers: ["#3a3028", "#2f2a26"][v % 2],
      sash: ["#c4862a", "#a8261f", "#8a6a3a"][v % 3],
      boots: "#4a3020",
      hat: v % 3 === 1 ? "turban" : "bork",
      hatColor: v % 3 === 1 ? "#e8e0cc" : "#efe8d8",
      beard: v % 4 === 3 ? undefined : ["#2b2018", "#3a2a1c", "#4a3a2a"][v % 3],
      longKaftan: false,
      rightItem: v % 2 === 0 ? "spear" : "none",
      leftItem: v % 3 === 0 ? "shield" : undefined,
    };
  },
  /** Balabancık Bey, commander of the siege fort. */
  balabancik: (): HumanoidLook => ({
    skin: "#b98660",
    kaftan: "#7a2a1f",
    sleeves: "#c9a03a",
    trousers: "#2a2420",
    sash: "#d6a540",
    boots: "#5a2a1a",
    hat: "bork",
    hatColor: "#f2ede2",
    hatAccent: "#d6a540",
    beard: "#5a5048",
    longKaftan: true,
    collar: "#5a3a22",
    scale: 1.04,
  }),
  /** The fort's cook. */
  asciHizir: (): HumanoidLook => ({
    skin: "#c08a64",
    kaftan: "#8a6a48",
    sleeves: "#e8dcc0",
    trousers: "#3a3028",
    sash: "#8e1a20",
    boots: "#3a2a1c",
    hat: "keche",
    hatColor: "#efe8d8",
    beard: "#6a5a48",
    longKaftan: false,
    apron: "#f2ede2",
    scale: 1.03,
  }),
  fatih: (): HumanoidLook => ({
    skin: "#d0a07c",
    kaftan: "#9e1a1f",
    sleeves: "#d6a540",
    trousers: "#3a2418",
    sash: "#e2b84f",
    boots: "#7a1a1a",
    hat: "kavuk",
    hatColor: "#f7f2e6",
    hatAccent: "#b3141c",
    beard: "#3b2a1a",
    longKaftan: true,
    scale: 1.05,
    collar: "#6b4a2e",
  }),
};

type PartName =
  | "torso"
  | "skirt"
  | "skirtShort"
  | "belt"
  | "head"
  | "beard"
  | "arm"
  | "hand"
  | "leg"
  | "boot"
  | "bork"
  | "turban"
  | "kavuk"
  | "helmet"
  | "cap"
  | "byzHelmet"
  | "plume"
  | "collar"
  | "spear"
  | "shield"
  | "hammer"
  | "hatBand"
  | "yazma"
  | "keche"
  | "apron"
  | "mallet"
  | "paddle"
  | "davulStick"
  | "zurna"
  | "davul"
  | "fes"
  | "fesTassel"
  | "kalpak"
  | "kabalak"
  | "bashlik"
  | "bandolier"
  | "mustache"
  | "rifle";

interface PartDef {
  material: MaterialKey;
  build(b: GeoBuilder): void;
}

const white: RGBA = [1, 1, 1, 1];

const PART_DEFS: Record<PartName, PartDef> = {
  torso: { material: "fabric", build: (b) => b.box(0, 0.28, 0, 0.4, 0.56, 0.24, { topScale: 1.18, topScaleZ: 1.05, color: white }) },
  skirt: { material: "fabric", build: (b) => b.cylinder(0, -0.6, 0, 0.32, 0.21, 0.66, { segments: 8, color: white, caps: false }) },
  skirtShort: { material: "fabric", build: (b) => b.cylinder(0, -0.22, 0, 0.25, 0.21, 0.3, { segments: 8, color: white, caps: false }) },
  belt: { material: "fabric", build: (b) => b.cylinder(0, 0.0, 0, 0.225, 0.225, 0.11, { segments: 8, color: white }) },
  head: {
    material: "skin",
    build: (b) => {
      b.cylinder(0, -0.04, 0, 0.06, 0.06, 0.08, { segments: 5, color: white });
      b.sphere(0, 0.13, 0, 0.12, { segments: 7, rings: 5, scaleY: 1.12, color: white });
      b.box(0, 0.11, 0.115, 0.04, 0.06, 0.04, { color: white });
    },
  },
  beard: { material: "matte", build: (b) => b.box(0, 0.04, 0.07, 0.17, 0.12, 0.1, { topScale: 1, color: white }) },
  arm: { material: "fabric", build: (b) => b.box(0, -0.29, 0, 0.11, 0.58, 0.12, { topScale: 1.1, color: white }) },
  hand: { material: "skin", build: (b) => b.box(0, -0.63, 0.01, 0.08, 0.1, 0.09, { color: white }) },
  leg: { material: "fabric", build: (b) => b.box(0, -0.42, 0, 0.15, 0.84, 0.16, { topScale: 1.15, color: white }) },
  boot: { material: "matte", build: (b) => b.box(0, -0.86, 0.04, 0.15, 0.12, 0.26, { color: white }) },
  bork: {
    material: "fabric",
    build: (b) => {
      b.cylinder(0, 0.18, 0, 0.13, 0.12, 0.3, { segments: 7, color: white });
      // The long felt flap falling down the back.
      b.box(0, 0.2, -0.16, 0.18, 0.42, 0.05, { color: white });
    },
  },
  turban: { material: "fabric", build: (b) => b.sphere(0, 0.26, -0.01, 0.15, { segments: 8, rings: 5, scaleY: 0.68, color: white }) },
  kavuk: {
    material: "fabric",
    build: (b) => {
      // Large Ottoman kavuk sitting above the brow so the face stays visible.
      b.sphere(0, 0.36, -0.01, 0.21, { segments: 10, rings: 6, scaleY: 0.72, color: white, jitter: 0.03 });
    },
  },
  fes: { material: "fabric", build: (b) => b.cylinder(0, 0.17, 0, 0.115, 0.095, 0.17, { segments: 9, color: white }) },
  fesTassel: { material: "fabric", build: (b) => b.box(-0.06, 0.24, -0.06, 0.03, 0.12, 0.03, { color: white }) },
  kalpak: {
    material: "fabric",
    // Astrakhan fur kalpak: a little wider at the top, flat crown.
    build: (b) => b.cylinder(0, 0.15, 0, 0.128, 0.142, 0.2, { segments: 9, color: white, jitter: 0.05 }),
  },
  mustache: { material: "matte", build: (b) => b.box(0, 0.075, 0.118, 0.11, 0.025, 0.03, { color: white }) },
  kabalak: {
    material: "fabric",
    // WWI Ottoman "kabalak": a khaki cloth wound round a light frame — rounded, a little bulky.
    build: (b) => {
      b.cylinder(0, 0.1, 0, 0.13, 0.138, 0.11, { segments: 9, color: white });
      b.sphere(0, 0.2, 0, 0.138, { segments: 9, rings: 5, scaleY: 0.62, color: white, jitter: 0.04 });
    },
  },
  bashlik: {
    material: "fabric",
    // Black kerchief tied round the head, the knot's ends hanging at the side.
    build: (b) => {
      b.sphere(0, 0.17, -0.01, 0.138, { segments: 8, rings: 5, scaleY: 0.95, color: white });
      b.box(0.11, 0.08, -0.06, 0.04, 0.16, 0.05, { color: white });
    },
  },
  bandolier: {
    material: "matte",
    build: (b) => {
      b.push(Matrix.RotationZ(0.62));
      b.box(0, 0.28, 0, 0.07, 0.72, 0.27, { color: white });
      b.pop();
    },
  },
  rifle: {
    material: "wood",
    build: (b) => {
      b.cylinder(0, -0.55, 0.04, 0.02, 0.02, 1.0, { segments: 4, color: hexColor("#2a2a2a") });
      b.box(0, -0.75, 0.05, 0.05, 0.42, 0.07, { color: hexColor("#6a4a2a") });
    },
  },
  hatBand: { material: "fabric", build: (b) => b.cylinder(0, 0.44, 0, 0.09, 0.03, 0.2, { segments: 7, color: white }) },
  helmet: {
    material: "iron",
    build: (b) => {
      b.cylinder(0, 0.15, 0, 0.14, 0.02, 0.28, { segments: 8, color: white });
      b.cylinder(0, 0.05, 0, 0.145, 0.145, 0.1, { segments: 8, color: white, caps: false });
    },
  },
  byzHelmet: {
    material: "iron",
    build: (b) => {
      b.sphere(0, 0.17, 0, 0.14, { segments: 8, rings: 4, scaleY: 0.9, color: white });
      b.box(0, 0.12, 0.13, 0.03, 0.1, 0.03, { color: white });
    },
  },
  yazma: {
    material: "fabric",
    build: (b) => {
      // Tülbent wrapped over the head, tied at the nape and falling over the shoulders.
      b.sphere(0, 0.17, -0.015, 0.142, { segments: 8, rings: 5, scaleY: 1.05, color: white });
      b.box(0, 0.04, -0.105, 0.2, 0.2, 0.04, { topScale: 0.75, color: white });
      b.box(0, 0.23, 0.115, 0.22, 0.035, 0.03, { color: hexColor("#c43a2a") });
    },
  },
  keche: {
    material: "fabric",
    // Yörük-style rounded felt cap (keçe külah).
    build: (b) => b.cylinder(0, 0.16, -0.005, 0.128, 0.085, 0.16, { segments: 8, color: white }),
  },
  apron: { material: "fabric", build: (b) => b.box(0, -0.42, 0.2, 0.4, 0.82, 0.03, { topScale: 0.8, color: white }) },
  mallet: {
    material: "wood",
    build: (b) => {
      // Long keşkek tokmağı: handle + heavy round head.
      b.cylinder(0, -0.5, 0.06, 0.03, 0.03, 1.15, { segments: 5, color: hexColor("#7a5a3a") });
      b.cylinder(0, 0.62, 0.06, 0.11, 0.1, 0.3, { segments: 7, color: hexColor("#6a4a2a") });
    },
  },
  paddle: {
    material: "wood",
    build: (b) => {
      b.cylinder(0, -0.2, 0.05, 0.025, 0.025, 1.6, { segments: 5, color: hexColor("#8a6a48") });
      b.box(0, -0.35, 0.05, 0.14, 0.32, 0.03, { color: hexColor("#7a5a3a") });
    },
  },
  davulStick: { material: "wood", build: (b) => b.cylinder(0, -0.15, 0.08, 0.018, 0.022, 0.42, { segments: 4, color: hexColor("#d9c9a3") }) },
  zurna: {
    material: "wood",
    build: (b) => {
      b.push(Matrix.RotationX(-1.2));
      b.cylinder(0, -0.05, 0, 0.018, 0.06, 0.45, { segments: 6, color: hexColor("#5a3a20") });
      b.pop();
    },
  },
  davul: {
    material: "matte",
    build: (b) => {
      b.push(Matrix.RotationZ(Math.PI / 2));
      b.cylinder(0, -0.2, 0, 0.27, 0.27, 0.4, { segments: 12, color: hexColor("#e8dcc0") });
      b.pop();
    },
  },
  plume: { material: "fabric", build: (b) => b.cylinder(0, 0.38, -0.02, 0.03, 0.06, 0.22, { segments: 5, color: white }) },
  cap: { material: "fabric", build: (b) => b.cylinder(0, 0.16, 0, 0.12, 0.1, 0.13, { segments: 7, color: white }) },
  collar: { material: "fabric", build: (b) => b.cylinder(0, 0.5, 0, 0.26, 0.22, 0.12, { segments: 8, color: white, caps: false }) },
  spear: {
    material: "wood",
    build: (b) => {
      b.cylinder(0, -0.9, 0.04, 0.025, 0.025, 2.6, { segments: 4, color: hexColor("#6a4a2a") });
      b.cylinder(0, 1.7, 0.04, 0.045, 0, 0.3, { segments: 4, color: hexColor("#8f8a80") });
    },
  },
  shield: {
    material: "matte",
    build: (b) => {
      b.push(Matrix.RotationZ(Math.PI / 2).multiply(Matrix.Translation(-0.1, -0.38, 0)));
      b.cylinder(0, -0.03, 0, 0.36, 0.36, 0.06, { segments: 10, color: white });
      b.cylinder(0, 0.03, 0, 0.08, 0.06, 0.05, { segments: 6, color: hexColor("#c9a03a") });
      b.pop();
    },
  },
  hammer: {
    material: "wood",
    build: (b) => {
      b.box(0, -0.62, 0.15, 0.04, 0.04, 0.35, { color: hexColor("#6a4a2a") });
      b.box(0, -0.62, 0.34, 0.08, 0.12, 0.12, { color: hexColor("#5a4a3a") });
    },
  },
};

/** Per-NPC node hierarchy driven by the procedural animator. */
export interface HumanoidRig {
  root: TransformNode;
  hips: TransformNode;
  torso: TransformNode;
  head: TransformNode;
  armL: TransformNode;
  armR: TransformNode;
  legL: TransformNode;
  legR: TransformNode;
  instances: InstancedMesh[];
  scale: number;
}

/**
 * Shared, instanced humanoid parts. All NPCs together cost one draw call per part type,
 * colours come from per-instance buffers (no material per character).
 */
export class HumanoidFactory {
  private sources = new Map<PartName, Mesh>();
  private count = 0;

  constructor(
    private readonly scene: Scene,
    private readonly materials: MaterialLibrary,
    private readonly pipeline: RenderPipeline | null,
  ) {}

  private source(name: PartName): Mesh {
    let m = this.sources.get(name);
    if (!m) {
      const def = PART_DEFS[name];
      const b = new GeoBuilder();
      def.build(b);
      m = b.toMesh(`npc-part:${name}`, this.scene);
      m.material = this.materials.get(def.material);
      m.isVisible = false;
      m.isPickable = false;
      registerInstancedBufferWithCapacity(m, "instanceColor", 4, 512);
      m.instancedBuffers.instanceColor = new Color4(1, 1, 1, 1);
      if (this.pipeline) this.pipeline.addShadowCaster(m);
      this.sources.set(name, m);
    }
    return m;
  }

  private add(rig: HumanoidRig, part: PartName, parent: TransformNode, color: string, x = 0, y = 0, z = 0): InstancedMesh {
    const inst = this.source(part).createInstance(`${part}#${this.count}`);
    inst.parent = parent;
    inst.position.set(x, y, z);
    const c = hexColor(color);
    inst.instancedBuffers.instanceColor = new Color4(c[0], c[1], c[2], 1);
    inst.isPickable = false;
    rig.instances.push(inst);
    return inst;
  }

  create(look: HumanoidLook, name = "npc"): HumanoidRig {
    this.count++;
    const scene = this.scene;
    const root = new TransformNode(`${name}#${this.count}`, scene);
    const scale = look.scale ?? 1;
    root.scaling.setAll(scale);
    const node = (n: string, parent: TransformNode, x: number, y: number, z: number) => {
      const t = new TransformNode(`${n}#${this.count}`, scene);
      t.parent = parent;
      t.position.set(x, y, z);
      return t;
    };
    const hips = node("hips", root, 0, 0.95, 0);
    const torso = node("torso", hips, 0, 0, 0);
    const head = node("head", torso, 0, 0.6, 0);
    const armL = node("armL", torso, -0.27, 0.52, 0);
    const armR = node("armR", torso, 0.27, 0.52, 0);
    const legL = node("legL", hips, -0.11, 0, 0);
    const legR = node("legR", hips, 0.11, 0, 0);
    const rig: HumanoidRig = { root, hips, torso, head, armL, armR, legL, legR, instances: [], scale };

    this.add(rig, "torso", torso, look.kaftan);
    this.add(rig, look.longKaftan ? "skirt" : "skirtShort", hips, look.kaftan);
    this.add(rig, "belt", hips, look.sash);
    if (look.collar) this.add(rig, "collar", torso, look.collar);
    this.add(rig, "head", head, look.skin);
    if (look.beard) this.add(rig, "beard", head, look.beard);
    if (look.mustache && !look.beard) this.add(rig, "mustache", head, look.mustache);
    if (look.hat === "fes") this.add(rig, "fesTassel", head, "#1a1614");
    if (look.hat !== "none") this.add(rig, look.hat, head, look.hatColor);
    if (look.hat === "kavuk") this.add(rig, "hatBand", head, look.hatAccent ?? "#b3141c");
    if (look.hat === "helmet" && look.hatAccent) this.add(rig, "plume", head, look.hatAccent);
    if (look.hat === "bork" && look.hatAccent) this.add(rig, "hatBand", head, look.hatAccent).scaling.set(0.8, 0.5, 0.8);
    if (look.apron) this.add(rig, "apron", torso, look.apron, 0, 0.4, 0);
    if (look.bandolier) this.add(rig, "bandolier", torso, look.bandolier);
    if (look.davul) this.add(rig, "davul", torso, "#ffffff", 0, 0.05, 0.3);
    for (const arm of [armL, armR]) {
      this.add(rig, "arm", arm, look.sleeves);
      this.add(rig, "hand", arm, look.skin);
    }
    for (const leg of [legL, legR]) {
      this.add(rig, "leg", leg, look.trousers);
      this.add(rig, "boot", leg, look.boots);
    }
    if (look.rightItem && look.rightItem !== "none") this.add(rig, look.rightItem, armR, "#ffffff", 0, -0.62, 0.02);
    if (look.leftItem === "davulStick") this.add(rig, "davulStick", armL, "#ffffff", 0, -0.62, 0.02);
    if (look.leftItem === "shield") this.add(rig, "shield", armL, look.kaftan === "#3a3f6a" ? "#c9a03a" : "#2f4f8f", 0, 0, 0);
    return rig;
  }

  disposeRig(rig: HumanoidRig): void {
    rig.root.dispose(false, false);
  }
}
