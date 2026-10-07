import { Constants, RawTexture, type Scene } from "@babylonjs/core";
import { Noise2D } from "../utils/noise";
import { Random } from "../utils/random";

/**
 * Procedural texture generator. Every texture the game needs (stone walls with the
 * characteristic Theodosian brick bands, planks, cloth, roof tiles, flags, …) is generated
 * on the CPU once and cached, so the game ships without any image files and the resolution
 * scales with the graphics preset.
 */
export type TileableKind = "stoneWall" | "wood" | "cloth" | "roofTiles" | "plaster" | "ground" | "cobble";

export interface TexturePixels {
  size: number;
  albedo: Uint8Array;
  normal: Uint8Array | null;
}

const cache = new Map<string, TexturePixels>();
const noise = new Noise2D(31);

function heightToNormal(height: Float32Array, size: number, strength: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

class PixelCanvas {
  readonly albedo: Uint8Array;
  readonly height: Float32Array;
  constructor(readonly size: number) {
    this.albedo = new Uint8Array(size * size * 4);
    this.height = new Float32Array(size * size);
  }
  set(x: number, y: number, r: number, g: number, b: number, h: number): void {
    const i = y * this.size + x;
    this.albedo[i * 4] = Math.max(0, Math.min(255, r));
    this.albedo[i * 4 + 1] = Math.max(0, Math.min(255, g));
    this.albedo[i * 4 + 2] = Math.max(0, Math.min(255, b));
    this.albedo[i * 4 + 3] = 255;
    this.height[i] = h;
  }
}

function genStoneWall(size: number): TexturePixels {
  // One vertical tile = 5 courses of limestone ashlar + a band of 4 red brick courses.
  const c = new PixelCanvas(size);
  const rnd = new Random(7);
  const ashlarRows = 5;
  const ashlarH = 0.14;
  const brickRows = 4;
  const brickH = (1 - ashlarRows * ashlarH) / brickRows;
  const rows: { y0: number; y1: number; brick: boolean; blocks: number; offset: number; tint: number[] }[] = [];
  let y = 0;
  for (let r = 0; r < ashlarRows; r++) {
    rows.push({ y0: y, y1: y + ashlarH, brick: false, blocks: 3, offset: (r % 2) * 0.5, tint: [] });
    y += ashlarH;
  }
  for (let r = 0; r < brickRows; r++) {
    rows.push({ y0: y, y1: y + brickH, brick: true, blocks: 7, offset: (r % 2) * 0.5, tint: [] });
    y += brickH;
  }
  for (const row of rows) for (let b = 0; b < row.blocks + 1; b++) row.tint.push(rnd.range(-1, 1));
  for (let py = 0; py < size; py++) {
    const v = py / size;
    const row = rows.find((r) => v >= r.y0 && v < r.y1) ?? rows[rows.length - 1];
    const lv = (v - row.y0) / (row.y1 - row.y0);
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const bu = (u * row.blocks + row.offset) % row.blocks;
      const blockIndex = Math.floor(bu);
      const lu = bu - blockIndex;
      const mortarU = row.brick ? 0.035 : 0.018;
      const mortarV = row.brick ? 0.12 : 0.06;
      const edge = Math.min(lu, 1 - lu) / mortarU;
      const edgeV = Math.min(lv, 1 - lv) / mortarV;
      const inMortar = edge < 1 || edgeV < 1;
      const n = noise.tileable(u * 8, v * 8, 8, 4);
      const fine = noise.tileable(u * 32, v * 32, 32, 2);
      const tint = row.tint[blockIndex] ?? 0;
      let r: number, g: number, b: number, h: number;
      if (inMortar) {
        r = 196 + n * 14;
        g = 186 + n * 14;
        b = 166 + n * 12;
        h = 0.1 + fine * 0.03;
      } else if (row.brick) {
        r = 158 + tint * 18 + n * 18;
        g = 78 + tint * 10 + n * 10;
        b = 56 + tint * 8 + n * 8;
        h = 0.75 + fine * 0.08 + Math.min(1, edge * 0.4, edgeV * 0.4) * 0.15;
      } else {
        const weather = Math.max(0, noise.tileable(u * 3 + 11, v * 3, 3, 3));
        r = 206 + tint * 14 + n * 20 - weather * 40;
        g = 192 + tint * 12 + n * 18 - weather * 38;
        b = 162 + tint * 10 + n * 16 - weather * 30;
        h = 0.7 + n * 0.12 + fine * 0.06 + Math.min(1, edge * 0.25, edgeV * 0.25) * 0.2;
      }
      c.set(px, py, r + fine * 10, g + fine * 10, b + fine * 8, h);
    }
  }
  return { size, albedo: c.albedo, normal: heightToNormal(c.height, size, size / 64) };
}

function genWood(size: number): TexturePixels {
  const c = new PixelCanvas(size);
  const rnd = new Random(11);
  const planks = 5;
  const tints = Array.from({ length: planks }, () => rnd.range(-1, 1));
  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const pu = u * planks;
      const idx = Math.floor(pu);
      const lu = pu - idx;
      const gap = Math.min(lu, 1 - lu) < 0.035;
      const grain = noise.tileable(u * 40 + idx * 3.1, v * 4, 40, 3);
      const ring = Math.sin((grain * 6 + u * 90) * 1.2) * 0.5 + 0.5;
      const knot = Math.max(0, noise.tileable(u * 6 + idx, v * 6, 6, 2) - 0.55) * 3;
      const t = tints[idx] ?? 0;
      let r = 132 + t * 16 + ring * 22 - knot * 40;
      let g = 92 + t * 12 + ring * 16 - knot * 30;
      let b = 58 + t * 8 + ring * 10 - knot * 20;
      let h = 0.6 + ring * 0.12 - knot * 0.2;
      if (gap) {
        r *= 0.35;
        g *= 0.35;
        b *= 0.35;
        h = 0.1;
      }
      c.set(px, py, r, g, b, h);
    }
  }
  return { size, albedo: c.albedo, normal: heightToNormal(c.height, size, size / 96) };
}

function genCloth(size: number): TexturePixels {
  const c = new PixelCanvas(size);
  const weave = Math.max(32, size / 8);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const v = py / size;
      const wx = Math.sin(u * weave * Math.PI * 2) * 0.5 + 0.5;
      const wy = Math.sin(v * weave * Math.PI * 2) * 0.5 + 0.5;
      const n = noise.tileable(u * 6, v * 6, 6, 3);
      const base = 232 + n * 14 - (wx * wy) * 14;
      c.set(px, py, base, base - 4, base - 12, wx * 0.5 + wy * 0.5);
    }
  }
  return { size, albedo: c.albedo, normal: heightToNormal(c.height, size, size / 256) };
}

function genRoofTiles(size: number): TexturePixels {
  const c = new PixelCanvas(size);
  const cols = 8;
  const rows = 8;
  const rnd = new Random(5);
  const tints = Array.from({ length: cols * rows }, () => rnd.range(-1, 1));
  for (let py = 0; py < size; py++) {
    const v = py / size;
    const row = Math.floor(v * rows);
    const lv = v * rows - row;
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const cu = u * cols + (row % 2) * 0.5;
      const col = Math.floor(cu) % cols;
      const lu = cu - Math.floor(cu);
      const barrel = Math.sin(lu * Math.PI);
      const overlap = 1 - lv * 0.35;
      const t = tints[row * cols + col];
      const n = noise.tileable(u * 10, v * 10, 10, 3);
      const shade = 0.55 + barrel * 0.45 * overlap;
      c.set(px, py, (176 + t * 18 + n * 18) * shade, (88 + t * 10 + n * 10) * shade, (58 + t * 6) * shade, barrel * overlap);
    }
  }
  return { size, albedo: c.albedo, normal: heightToNormal(c.height, size, size / 48) };
}

function genPlaster(size: number): TexturePixels {
  const c = new PixelCanvas(size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const v = py / size;
      const n = noise.tileable(u * 4, v * 4, 4, 5);
      const stain = Math.max(0, noise.tileable(u * 2 + 5, v * 2, 2, 3)) * 50;
      c.set(px, py, 236 + n * 14 - stain, 226 + n * 14 - stain, 204 + n * 12 - stain * 1.1, n);
    }
  }
  return { size, albedo: c.albedo, normal: heightToNormal(c.height, size, size / 160) };
}

function genGround(size: number): TexturePixels {
  // Neutral grayscale detail — multiplied with the terrain's vertex colors.
  const c = new PixelCanvas(size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const v = py / size;
      const n = noise.tileable(u * 8, v * 8, 8, 5);
      const pebble = Math.max(0, noise.tileable(u * 48, v * 48, 48, 1) - 0.45) * 2.4;
      const g = 226 + n * 26 - pebble * 50;
      c.set(px, py, g, g, g, n + pebble);
    }
  }
  return { size, albedo: c.albedo, normal: heightToNormal(c.height, size, size / 128) };
}

function genCobble(size: number): TexturePixels {
  // Voronoi cobblestones (tileable).
  const c = new PixelCanvas(size);
  const rnd = new Random(23);
  const cells = 7;
  const pts: { x: number; y: number; t: number }[] = [];
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      pts.push({ x: rnd.range(0.2, 0.8), y: rnd.range(0.2, 0.8), t: rnd.range(-1, 1) });
    }
  }
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const v = py / size;
      const cx = Math.floor(u * cells);
      const cy = Math.floor(v * cells);
      let d1 = 9;
      let d2 = 9;
      let tint = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox;
          const ny = cy + oy;
          const p = pts[(((ny % cells) + cells) % cells) * cells + (((nx % cells) + cells) % cells)];
          const d = Math.hypot(u - (nx + p.x) / cells, v - (ny + p.y) / cells);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            tint = p.t;
          } else if (d < d2) d2 = d;
        }
      }
      const edge = (d2 - d1) * cells;
      const n = noise.tileable(u * 16, v * 16, 16, 2);
      const mortar = edge < 0.12;
      const h = mortar ? 0 : Math.min(1, edge * 2) * 0.8 + n * 0.1;
      const base = mortar ? 120 : 168 + tint * 22 + n * 16;
      c.set(px, py, base + 6, base, base - 10, h);
    }
  }
  return { size, albedo: c.albedo, normal: heightToNormal(c.height, size, size / 56) };
}

const GENERATORS: Record<TileableKind, (size: number) => TexturePixels> = {
  stoneWall: genStoneWall,
  wood: genWood,
  cloth: genCloth,
  roofTiles: genRoofTiles,
  plaster: genPlaster,
  ground: genGround,
  cobble: genCobble,
};

export function getTexturePixels(kind: TileableKind, size: number): TexturePixels {
  const key = `${kind}:${size}`;
  let px = cache.get(key);
  if (!px) {
    px = GENERATORS[kind](size);
    cache.set(key, px);
  }
  return px;
}

export function createRawTexture(scene: Scene, data: Uint8Array, size: number, name: string, linear = false): RawTexture {
  const tex = RawTexture.CreateRGBATexture(
    data,
    size,
    size,
    scene,
    true,
    false,
    Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
  );
  tex.name = name;
  tex.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
  tex.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  tex.gammaSpace = !linear;
  return tex;
}

// ------------------------------------------------------------------------- PROP ATLAS
/** Named rectangles inside the props atlas (u0, v0, u1, v1). v0 = top row of the image. */
export const ATLAS_RECTS = {
  crate: [0, 0, 0.5, 0.5],
  barrel: [0.5, 0, 1, 0.5],
  flagOttoman: [0, 0.5, 0.5, 0.75],
  flagByzantine: [0.5, 0.5, 1, 0.75],
  otagFabric: [0, 0.75, 0.5, 1],
  tentFabric: [0.5, 0.75, 1, 1],
} as const;
export type AtlasRegion = keyof typeof ATLAS_RECTS;

function drawCrescent(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, bg: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx + r * 0.32, cy, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawPropAtlas(size: number): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Uint8Array(size * size * 4).fill(200);
  const S = size;
  const rnd = new Random(99);

  // Crate: planks with a darker frame and diagonal brace.
  {
    const x0 = 0;
    const y0 = 0;
    const w = S / 2;
    ctx.fillStyle = "#8a6038";
    ctx.fillRect(x0, y0, w, w);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `hsl(28, ${38 + rnd.range(-6, 6)}%, ${33 + rnd.range(-5, 5)}%)`;
      ctx.fillRect(x0 + 4, y0 + (i * w) / 5 + 2, w - 8, w / 5 - 4);
    }
    ctx.strokeStyle = "#4a3018";
    ctx.lineWidth = w * 0.09;
    ctx.strokeRect(x0 + ctx.lineWidth / 2, y0 + ctx.lineWidth / 2, w - ctx.lineWidth, w - ctx.lineWidth);
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.08, y0 + w * 0.92);
    ctx.lineTo(x0 + w * 0.92, y0 + w * 0.08);
    ctx.lineWidth = w * 0.07;
    ctx.stroke();
    ctx.fillStyle = "#2b2b2b";
    for (const [px, py] of [
      [0.06, 0.06],
      [0.94, 0.06],
      [0.06, 0.94],
      [0.94, 0.94],
    ]) {
      ctx.beginPath();
      ctx.arc(x0 + px * w, y0 + py * w, w * 0.015, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Barrel staves + iron hoops.
  {
    const x0 = S / 2;
    const w = S / 2;
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `hsl(26, ${42 + rnd.range(-6, 6)}%, ${30 + rnd.range(-5, 6)}%)`;
      ctx.fillRect(x0 + (i * w) / 10, 0, w / 10 - 1, w);
    }
    ctx.fillStyle = "#3a3632";
    for (const hy of [0.1, 0.32, 0.68, 0.9]) ctx.fillRect(x0, hy * w - w * 0.03, w, w * 0.06);
  }
  // Ottoman banner: crimson with a white crescent (period sancak style), gold fringe.
  {
    const x0 = 0;
    const y0 = S / 2;
    const w = S / 2;
    const h = S / 4;
    ctx.fillStyle = "#b3141c";
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = "#d4a73a";
    ctx.fillRect(x0, y0 + h - h * 0.06, w, h * 0.06);
    drawCrescent(ctx, x0 + w * 0.42, y0 + h * 0.5, h * 0.3, "#f4efe4", "#b3141c");
  }
  // Byzantine (Palaiologan) flag: gold field, red cross, four firesteels.
  {
    const x0 = S / 2;
    const y0 = S / 2;
    const w = S / 2;
    const h = S / 4;
    ctx.fillStyle = "#d9a520";
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = "#a3131b";
    ctx.fillRect(x0 + w * 0.45, y0, w * 0.1, h);
    ctx.fillRect(x0, y0 + h * 0.42, w, h * 0.16);
    ctx.font = `bold ${Math.floor(h * 0.34)}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const q = [
      [0.22, 0.22, false],
      [0.78, 0.22, true],
      [0.22, 0.78, false],
      [0.78, 0.78, true],
    ] as const;
    for (const [qx, qy, mirror] of q) {
      ctx.save();
      ctx.translate(x0 + qx * w, y0 + qy * h);
      if (mirror) ctx.scale(-1, 1);
      ctx.fillText("B", 0, 0);
      ctx.restore();
    }
  }
  // Sultan's otağ fabric: deep red with gold medallion pattern.
  {
    const x0 = 0;
    const y0 = (S * 3) / 4;
    const w = S / 2;
    const h = S / 4;
    ctx.fillStyle = "#8e1418";
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = "#d8ad48";
    ctx.fillStyle = "#d8ad48";
    ctx.lineWidth = Math.max(1, w / 128);
    const cells = 4;
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < 2; j++) {
        const cx = x0 + ((i + 0.5) * w) / cells;
        const cy = y0 + ((j + 0.5) * h) / 2;
        const r = h * 0.17;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const rr = k % 2 === 0 ? r : r * 0.55;
          ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillRect(x0, y0, w, h * 0.06);
    ctx.fillRect(x0, y0 + h * 0.94, w, h * 0.06);
  }
  // Soldier tent fabric: off-white with red band and zig-zag trim.
  {
    const x0 = S / 2;
    const y0 = (S * 3) / 4;
    const w = S / 2;
    const h = S / 4;
    ctx.fillStyle = "#ece3cf";
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = "#a8261f";
    ctx.fillRect(x0, y0 + h * 0.8, w, h * 0.2);
    ctx.beginPath();
    const teeth = 16;
    ctx.moveTo(x0, y0 + h * 0.8);
    for (let i = 0; i <= teeth; i++) {
      ctx.lineTo(x0 + (i / teeth) * w, y0 + h * (i % 2 === 0 ? 0.8 : 0.72));
    }
    ctx.lineTo(x0 + w, y0 + h * 0.8);
    ctx.fill();
    ctx.fillStyle = "#2f5f8f";
    ctx.fillRect(x0, y0 + h * 0.9, w, h * 0.03);
  }

  const img = ctx.getImageData(0, 0, size, size);
  // Fabric / wood grain noise pass.
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = noise.noise(x * 0.05, y * 0.05) * 9 + noise.noise(x * 0.3, y * 0.3) * 4;
      const i = (y * size + x) * 4;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
  }
  return new Uint8Array(d.buffer.slice(0));
}

export function getPropAtlasPixels(size: number): Uint8Array {
  const key = `atlas:${size}`;
  const hit = cache.get(key);
  if (hit) return hit.albedo;
  const albedo = drawPropAtlas(size);
  cache.set(key, { size, albedo, normal: null });
  return albedo;
}

/** Soft radial puff used by smoke / dust particles. */
export function createPuffTexture(scene: Scene, size = 64): RawTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const n = noise.noise(x * 0.18, y * 0.18) * 0.18;
      const a = Math.max(0, 1 - r + n);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.min(255, a * a * 255);
    }
  }
  const tex = RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
  tex.hasAlpha = true;
  tex.name = "puff";
  return tex;
}

/** Hard-edged spark/flare texture for muzzle flashes and embers. */
export function createFlareTexture(scene: Scene, size = 64): RawTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const ang = Math.atan2(dy, dx);
      const star = Math.pow(Math.abs(Math.cos(ang * 3)), 8) * 0.4;
      const a = Math.max(0, Math.pow(Math.max(0, 1 - r), 2.2) + star * Math.max(0, 1 - r));
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 230;
      data[i + 2] = 180;
      data[i + 3] = Math.min(255, a * 255);
    }
  }
  const tex = RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
  tex.hasAlpha = true;
  tex.name = "flare";
  return tex;
}
