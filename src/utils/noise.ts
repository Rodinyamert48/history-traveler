/**
 * Seeded 2D value/gradient noise + fBm. Used for terrain, textures and wind.
 * (Small self-contained implementation — no extra dependency needed.)
 */
export class Noise2D {
  private perm = new Uint8Array(512);
  private gradX = new Float32Array(256);
  private gradY = new Float32Array(256);

  constructor(seed = 1453) {
    let s = seed >>> 0 || 1;
    const rand = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
      const a = rand() * Math.PI * 2;
      this.gradX[i] = Math.cos(a);
      this.gradY[i] = Math.sin(a);
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  /** Gradient noise in roughly [-1, 1]. */
  noise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const perm = this.perm;
    const gx = this.gradX;
    const gy = this.gradY;
    const h00 = perm[X + perm[Y]];
    const h10 = perm[X + 1 + perm[Y]];
    const h01 = perm[X + perm[Y + 1]];
    const h11 = perm[X + 1 + perm[Y + 1]];
    const n00 = gx[h00] * xf + gy[h00] * yf;
    const n10 = gx[h10] * (xf - 1) + gy[h10] * yf;
    const n01 = gx[h01] * xf + gy[h01] * (yf - 1);
    const n11 = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return (nx0 + v * (nx1 - nx0)) * 1.41;
  }


  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Tileable noise over a period (used for seamless textures). */
  tileable(x: number, y: number, period: number, octaves = 4): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let p = period;
    let fx = x;
    let fy = y;
    for (let i = 0; i < octaves; i++) {
      const a = this.periodic(fx, fy, p);
      sum += a * amp;
      norm += amp;
      amp *= 0.5;
      fx *= 2;
      fy *= 2;
      p *= 2;
    }
    return sum / norm;
  }

  private periodic(x: number, y: number, period: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = ((xi % period) + period) % period & 255;
    const y0 = ((yi % period) + period) % period & 255;
    const x1 = (((xi + 1) % period) + period) % period & 255;
    const y1 = (((yi + 1) % period) + period) % period & 255;
    const perm = this.perm;
    const gx = this.gradX;
    const gy = this.gradY;
    const h00 = perm[x0 + perm[y0]];
    const h10 = perm[x1 + perm[y0]];
    const h01 = perm[x0 + perm[y1]];
    const h11 = perm[x1 + perm[y1]];
    const n00 = gx[h00] * xf + gy[h00] * yf;
    const n10 = gx[h10] * (xf - 1) + gy[h10] * yf;
    const n01 = gx[h01] * xf + gy[h01] * (yf - 1);
    const n11 = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return (nx0 + v * (nx1 - nx0)) * 1.41;
  }

}
