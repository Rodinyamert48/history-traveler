/**
 * Kayseri, c. 1390 — a walled market: a covered bazaar street (arasta) with shops on both
 * sides, opening north into a caravanserai courtyard (han) where Kadı Burhaneddin holds court.
 * Coordinates in meters, +x = east, +z = north, ground at y = 0. Walls everywhere: the player
 * never leaves the market.
 *
 *   z ▲   ┌──────────── han avlusu (açık gökyüzü) ────────────┐ z = 34
 *     │   │  revaklar         eyvan + Kadı'nın divanı          │
 *     │   │  ambar      şadırvan              develer          │
 *     │   └──────────────┐ (kemer) ┌───────────────────────────┘ z = 10
 *     │      dükkânlar   │  arasta │   dükkânlar  (bays of 4 m)
 *     │                  └──(kapı)─┘                             z = -20
 *     └────────────────────────────────────────────────────────► x
 */
export const LAYOUT = {
  bounds: { minX: -15, maxX: 15, minZ: -21, maxZ: 35 },
  arasta: {
    /** Street between the shop fronts. */
    streetX: 2.5,
    /** Back walls of the shops. */
    outerX: 6.5,
    z0: -20,
    z1: 10,
    /** Shop bay boundaries along z. */
    bays: [-18, -14, -10, -6, -2, 2, 6, 10],
    shopHeight: 3.6,
    vaultSpring: 4.2,
    vaultApex: 6.4,
  },
  han: { minX: -14, maxX: 14, z0: 10, z1: 34, height: 8, arcade: 3.5 },
  /** Opening between the arasta and the han courtyard. */
  hanGate: { x0: -2, x1: 2, height: 4.6 },
  iwan: { x0: -3.6, x1: 3.6, z0: 29.5, height: 7.2 },
  fountain: { x: 0, z: 21 },
  divan: { x: 0, z: 31.6, height: 0.55 },
  ambar: { x: 13.6, z: 20 },
  /** Our yağlama & mantı shop (two merged west bays). */
  shop: {
    x0: -6.5,
    x1: -2.5,
    z0: -2,
    z1: 6,
    counterX: -3.25,
    counter: { z0: -1.3, z1: 3.2 },
    sacX: -5.75,
    sacZ: [-0.6, 0.6, 1.8],
    dough: { x: -4.9, z: 5.25 },
  },
  /** Where the customer stands at our counter and where we stand behind it. */
  customerSpot: { x: -1.7, z: 1.0 },
  sellerSpot: { x: -4.05, z: 1.0 },
  kapan: { x: 4.6, z: 0 },
  spawn: { x: 0, z: -16.5, yaw: 0 },
};

export type ShopKind =
  | "bakirci"
  | "kumasci"
  | "baharatci"
  | "kasap"
  | "kilimci"
  | "sarac"
  | "pastirmaci"
  | "attar"
  | "kuyumcu"
  | "kapan"
  | "comlekci"
  | "serbetci";

/** Bay index (0 = southmost, centre z = -16) → shop on the west / east side of the street. */
export const SHOPS: { side: -1 | 1; bay: number; kind: ShopKind; name: string }[] = [
  { side: -1, bay: 0, kind: "bakirci", name: "Bakırcı" },
  { side: -1, bay: 1, kind: "kumasci", name: "Kumaşçı" },
  { side: -1, bay: 2, kind: "baharatci", name: "Baharatçı" },
  { side: -1, bay: 3, kind: "kasap", name: "Kasap" },
  { side: -1, bay: 6, kind: "kilimci", name: "Kilimci" },
  { side: 1, bay: 0, kind: "sarac", name: "Saraç" },
  { side: 1, bay: 1, kind: "pastirmaci", name: "Pastırmacı" },
  { side: 1, bay: 2, kind: "attar", name: "Attar" },
  { side: 1, bay: 3, kind: "kuyumcu", name: "Kuyumcu" },
  { side: 1, bay: 4, kind: "kapan", name: "Kapan (umumi terazi)" },
  { side: 1, bay: 5, kind: "comlekci", name: "Çömlekçi" },
  { side: 1, bay: 6, kind: "serbetci", name: "Şerbetçi" },
];

export const bayCenter = (bay: number): number => LAYOUT.arasta.bays[bay] + 2;
