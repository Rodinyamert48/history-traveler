/**
 * The first Grand National Assembly building (I. TBMM, Ulus/Ankara) on 23 April 1920 —
 * interior only. Coordinates in meters, +x = east, +z = north, floor at y = 0.
 *
 *   z ▲  ┌──────────────── Genel Kurul salonu ────────────────┐ z = 15
 *     │  │     başkanlık divanı + kürsü (dais, y = 0.6)       │
 *     │  │  kâtip masası      sıralar (4 × 5)     soba         │
 *     │  │            dinleyici parmaklığı                    │
 *     │  ├───────────────── koridor ───────┤ (door) ├─────────┤ z = 0 … -4
 *     │  │ Telgrafhane │   giriş holü   │       Depo          │
 *     │  └─────────────┴─────(kapı)──────┴─────────────────────┘ z = -11
 *     └──────────────────────────────────────────────────────► x   (x = -13 … 13)
 */
export const LAYOUT = {
  bounds: { minX: -13, maxX: 13, minZ: -11, maxZ: 15 },
  outer: { minX: -13, maxX: 13, minZ: -11, maxZ: 15 },
  wallHeight: 4.4,
  wallThickness: 0.4,
  corridor: { z0: -4, z1: 0 },
  vestibule: { x0: -3, x1: 3 },
  hallDoor: { x0: -1.6, x1: 1.6 },
  telegraphDoor: { x0: -8.6, x1: -7.0 },
  depotDoor: { x0: 7.0, x1: 8.6 },
  dais: { x0: -8, x1: 8, z0: 11.5, z1: 15, height: 0.6 },
  lectern: { x: 0, z: 12.15 },
  presidency: { x: 0, z: 13.4 },
  presidencyChairs: [-2.4, 0, 2.4],
  clerkDesk: { x: -5.6, z: 10.3 },
  deskColumns: [-8.6, -4.9, 4.9, 8.6],
  deskRows: [2.6, 4.2, 5.8, 7.4, 9.0],
  railingZ: 1.0,
  stove: { x: 11.6, z: 6 },
  /** Hanging lamps (x, z). */
  lamps: [
    [-6.8, 3.4],
    [0, 3.4],
    [6.8, 3.4],
    [-6.8, 7.6],
    [0, 7.6],
    [6.8, 7.6],
    [-4, 12.6],
    [4, 12.6],
  ] as [number, number][],
  telegraph: { x: -12.0, z: -7.4 },
  depot: { x: 9.5, z: -8.6 },
  spawn: { x: 0, z: -9, yaw: 0 },
};
