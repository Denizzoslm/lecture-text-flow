/**
 * Mode "scanner d'imprimante", 100 % côté client :
 * détection des bords de la feuille, correction de perspective,
 * recadrage puis filtre document (fond blanchi, traits foncés, couleurs gardées).
 */

const MAX_SOURCE_SIDE = 2000;
const MAX_OUTPUT_SIDE = 1700;
const WORK_SIDE = 320;
const JPEG_QUALITY = 0.86;

export type Corner = { x: number; y: number };
export type Quad = [Corner, Corner, Corner, Corner]; // haut-gauche, haut-droit, bas-droit, bas-gauche

export type ScanResult = {
  /** Photo d'origine remise à l'échelle (base pour un recadrage manuel). */
  sourceDataUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  /** Image finale traitée « comme scannée ». */
  scanDataUrl: string;
  /** Coins détectés dans le repère de sourceDataUrl (null si détection échouée). */
  quad: Quad | null;
};

/** Pipeline complet : photo -> image scannée. */
export async function scanFile(file: File): Promise<ScanResult> {
  const source = await drawSource(file);
  const quad = detectDocumentQuad(source);
  const scanDataUrl = renderScan(source, quad);
  return {
    sourceDataUrl: source.canvas.toDataURL("image/jpeg", JPEG_QUALITY),
    sourceWidth: source.canvas.width,
    sourceHeight: source.canvas.height,
    scanDataUrl,
    quad,
  };
}

/** Recadrage manuel : régénère l'image scannée depuis de nouveaux coins. */
export async function rescanFromQuad(sourceDataUrl: string, quad: Quad | null): Promise<string> {
  const image = await loadFromUrl(sourceDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = context2d(canvas);
  ctx.drawImage(image, 0, 0);
  return renderScan({ canvas, ctx }, quad);
}

type Source = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Traitement d'image indisponible sur cet appareil.");
  return ctx;
}

async function drawSource(file: File): Promise<Source> {
  const image = await loadImage(file);
  const w0 = "width" in image ? image.width : 0;
  const h0 = "height" in image ? image.height : 0;
  const scale = Math.min(1, MAX_SOURCE_SIDE / Math.max(w0, h0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  const ctx = context2d(canvas);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  if ("close" in image && typeof image.close === "function") image.close();
  return { canvas, ctx };
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fallback */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await loadFromUrl(url);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

function loadFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Fichier image illisible."));
    img.src = url;
  });
}

/* ---------------------------------------------------------------- détection */

function detectDocumentQuad(source: Source): Quad | null {
  const { canvas } = source;
  const scale = Math.min(1, WORK_SIDE / Math.max(canvas.width, canvas.height));
  const w = Math.max(32, Math.round(canvas.width * scale));
  const h = Math.max(32, Math.round(canvas.height * scale));

  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const sctx = context2d(small);
  sctx.drawImage(canvas, 0, 0, w, h);
  const data = sctx.getImageData(0, 0, w, h).data;

  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // Normalisation de l'éclairage : on divise par un fond local clair pour
  // que les ombres (coins sombres, pliures) ne rognent pas la feuille.
  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) luma[i] = gray[i] ?? 0;
  const background = boxBlurMax(luma, w, h, Math.max(6, Math.round(Math.min(w, h) / 6)));
  const flat = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const bg = Math.max(24, background[i] ?? 255);
    flat[i] = Math.min(255, Math.round(((luma[i] ?? 0) / bg) * 220));
  }

  const threshold = otsu(flat);
  // La feuille est la zone claire ; on garde la composante contenant le centre.
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) mask[i] = (flat[i] ?? 0) > threshold ? 1 : 0;

  const component = pageComponent(mask, w, h);
  if (!component) return null;

  const { pixels, size } = component;
  if (size < w * h * 0.18) return null;


  // Enveloppe convexe de la composante, puis quadrilatère d'aire maximale.
  const inside = new Uint8Array(w * h);
  for (const index of pixels) inside[index] = 1;
  const boundary: Corner[] = [];
  for (const index of pixels) {
    const x = index % w;
    const y = (index - x) / w;
    const edge =
      x === 0 ||
      y === 0 ||
      x === w - 1 ||
      y === h - 1 ||
      !inside[index - 1] ||
      !inside[index + 1] ||
      !inside[index - w] ||
      !inside[index + w];
    if (edge) boundary.push({ x, y });
  }

  const hull = simplify(convexHull(boundary), 48);
  if (hull.length < 4) return null;
  const best = maxAreaQuad(hull);
  if (!best) return null;

  const quad = orderQuad(best).map((corner) => ({ x: corner.x / scale, y: corner.y / scale })) as Quad;
  return isPlausible(quad, canvas.width, canvas.height) ? quad : null;
}

function convexHull(points: Corner[]): Corner[] {
  if (points.length < 4) return points;
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const build = (list: Corner[]) => {
    const stack: Corner[] = [];
    for (const point of list) {
      while (stack.length >= 2) {
        const a = stack[stack.length - 2] as Corner;
        const b = stack[stack.length - 1] as Corner;
        if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) <= 0) stack.pop();
        else break;
      }
      stack.push(point);
    }
    return stack;
  };
  const lower = build(sorted);
  const upper = build([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Garde au plus `max` sommets, en supprimant à chaque fois le sommet le moins « utile ». */
function simplify(hull: Corner[], max: number): Corner[] {
  const points = [...hull];
  while (points.length > max) {
    let worst = 0;
    let worstLoss = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[(i - 1 + points.length) % points.length] as Corner;
      const b = points[i] as Corner;
      const c = points[(i + 1) % points.length] as Corner;
      const loss = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
      if (loss < worstLoss) {
        worstLoss = loss;
        worst = i;
      }
    }
    points.splice(worst, 1);
  }
  return points;
}

function maxAreaQuad(hull: Corner[]): Corner[] | null {
  const n = hull.length;
  let best: Corner[] | null = null;
  let bestArea = 0;
  for (let i = 0; i < n - 3; i += 1) {
    for (let j = i + 1; j < n - 2; j += 1) {
      for (let k = j + 1; k < n - 1; k += 1) {
        for (let l = k + 1; l < n; l += 1) {
          const quad = [hull[i] as Corner, hull[j] as Corner, hull[k] as Corner, hull[l] as Corner];
          const area = polygonArea(quad as Quad);
          if (area > bestArea) {
            bestArea = area;
            best = quad;
          }
        }
      }
    }
  }
  return best;
}

/** Ordonne les 4 coins : haut-gauche, haut-droit, bas-droit, bas-gauche. */
function orderQuad(quad: Corner[]): Quad {
  const cx = quad.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = quad.reduce((sum, p) => sum + p.y, 0) / 4;
  const sorted = [...quad].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  let bestSum = Infinity;
  sorted.forEach((point, index) => {
    const sum = point.x + point.y;
    if (sum < bestSum) {
      bestSum = sum;
      start = index;
    }
  });
  return [
    sorted[start] as Corner,
    sorted[(start + 1) % 4] as Corner,
    sorted[(start + 2) % 4] as Corner,
    sorted[(start + 3) % 4] as Corner,
  ];
}


function otsu(gray: Uint8ClampedArray): number {
  const hist = new Array<number>(256).fill(0);
  for (const value of gray) hist[value] = (hist[value] ?? 0) + 1;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * (hist[t] ?? 0);
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVariance = -1;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t] ?? 0;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * (hist[t] ?? 0);
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return best;
}

/** Composante contenant le centre de l'image (repli : la plus grande). */
function pageComponent(mask: Uint8Array, w: number, h: number): { pixels: number[]; size: number } | null {
  const center = Math.floor(h / 2) * w + Math.floor(w / 2);
  if (mask[center]) {
    const seen = new Uint8Array(w * h);
    const stack = [center];
    seen[center] = 1;
    const pixels: number[] = [];
    while (stack.length) {
      const index = stack.pop() as number;
      pixels.push(index);
      const x = index % w;
      const y = (index - x) / w;
      const push = (next: number) => {
        if (mask[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      };
      if (x > 0) push(index - 1);
      if (x < w - 1) push(index + 1);
      if (y > 0) push(index - w);
      if (y < h - 1) push(index + w);
    }
    if (pixels.length > w * h * 0.18) return { pixels, size: pixels.length };
  }
  return largestComponent(mask, w, h);
}

function largestComponent(mask: Uint8Array, w: number, h: number): { pixels: number[]; size: number } | null {

  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  let best: { pixels: number[]; size: number } | null = null;

  for (let start = 0; start < w * h; start += 1) {
    if (!mask[start] || seen[start]) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    const pixels: number[] = [];
    while (stack.length) {
      const index = stack.pop() as number;
      pixels.push(index);
      const x = index % w;
      const y = (index - x) / w;
      if (x > 0) push(index - 1);
      if (x < w - 1) push(index + 1);
      if (y > 0) push(index - w);
      if (y < h - 1) push(index + w);
    }
    if (!best || pixels.length > best.size) best = { pixels, size: pixels.length };
  }
  return best;

  function push(next: number) {
    if (mask[next] && !seen[next]) {
      seen[next] = 1;
      stack.push(next);
    }
  }
}

function isPlausible(quad: Quad, width: number, height: number): boolean {
  const area = polygonArea(quad);
  const imageArea = width * height;
  if (area < imageArea * 0.2 || area > imageArea * 0.999) return false;
  const sides = [
    distance(quad[0], quad[1]),
    distance(quad[1], quad[2]),
    distance(quad[2], quad[3]),
    distance(quad[3], quad[0]),
  ];
  const minSide = Math.min(width, height) * 0.15;
  if (sides.some((side) => side < minSide)) return false;
  // convexité : tous les produits vectoriels de même signe
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i] as Corner;
    const b = quad[(i + 1) % 4] as Corner;
    const c = quad[(i + 2) % 4] as Corner;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) continue;
    const current = cross > 0 ? 1 : -1;
    if (sign === 0) sign = current;
    else if (sign !== current) return false;
  }
  return true;
}

function polygonArea(quad: Quad): number {
  let total = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i] as Corner;
    const b = quad[(i + 1) % 4] as Corner;
    total += a.x * b.y - b.x * a.y;
  }
  return Math.abs(total) / 2;
}

function distance(a: Corner, b: Corner) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/* -------------------------------------------------------- redressement + rendu */

function renderScan(source: Source, quad: Quad | null): string {
  const base = quad ? warp(source, quad) : fit(source);
  enhance(base.ctx, base.canvas.width, base.canvas.height);
  return base.canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

function fit(source: Source): Source {
  const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(source.canvas.width, source.canvas.height));
  if (scale === 1) return { canvas: source.canvas, ctx: source.ctx };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.canvas.width * scale);
  canvas.height = Math.round(source.canvas.height * scale);
  const ctx = context2d(canvas);
  ctx.drawImage(source.canvas, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function warp(source: Source, quad: Quad): Source {
  const widthPx = (distance(quad[0], quad[1]) + distance(quad[3], quad[2])) / 2;
  const heightPx = (distance(quad[0], quad[3]) + distance(quad[1], quad[2])) / 2;
  const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(widthPx, heightPx));
  const outW = Math.max(16, Math.round(widthPx * scale));
  const outH = Math.max(16, Math.round(heightPx * scale));

  const matrix = homography(
    [
      { x: 0, y: 0 },
      { x: outW, y: 0 },
      { x: outW, y: outH },
      { x: 0, y: outH },
    ],
    quad,
  );
  if (!matrix) return fit(source);

  const srcData = source.ctx.getImageData(0, 0, source.canvas.width, source.canvas.height);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = context2d(canvas);
  const out = ctx.createImageData(outW, outH);
  const [a = 1, b = 0, c = 0, d = 0, e = 1, f = 0, g = 0, hh = 0] = matrix;
  const sw = source.canvas.width;
  const sh = source.canvas.height;

  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      const denom = g * x + hh * y + 1;
      const sx = (a * x + b * y + c) / denom;
      const sy = (d * x + e * y + f) / denom;
      const target = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) {
        out.data[target] = 255;
        out.data[target + 1] = 255;
        out.data[target + 2] = 255;
        out.data[target + 3] = 255;
        continue;
      }
      sampleBilinear(srcData, sw, sx, sy, out.data, target);
    }
  }
  ctx.putImageData(out, 0, 0);
  return { canvas, ctx };
}

function sampleBilinear(
  src: ImageData,
  sw: number,
  sx: number,
  sy: number,
  target: Uint8ClampedArray,
  offset: number,
) {
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(x0 + 1, sw - 1);
  const y1 = y0 + 1;
  const fx = sx - x0;
  const fy = sy - y0;
  for (let channel = 0; channel < 3; channel += 1) {
    const p00 = src.data[(y0 * sw + x0) * 4 + channel] ?? 255;
    const p10 = src.data[(y0 * sw + x1) * 4 + channel] ?? 255;
    const p01 = src.data[(y1 * sw + x0) * 4 + channel] ?? p00;
    const p11 = src.data[(y1 * sw + x1) * 4 + channel] ?? p10;
    const top = p00 + (p10 - p00) * fx;
    const bottom = p01 + (p11 - p01) * fx;
    target[offset + channel] = top + (bottom - top) * fy;
  }
  target[offset + 3] = 255;
}

/** Homographie dest -> src (8 coefficients). */
function homography(dest: Corner[], src: Corner[]): number[] | null {
  const A: number[][] = [];
  const bVec: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const d = dest[i] as Corner;
    const s = src[i] as Corner;
    A.push([d.x, d.y, 1, 0, 0, 0, -d.x * s.x, -d.y * s.x]);
    bVec.push(s.x);
    A.push([0, 0, 0, d.x, d.y, 1, -d.x * s.y, -d.y * s.y]);
    bVec.push(s.y);
  }
  return solve(A, bVec);
}

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let i = 0; i < n; i += 1) {
    let pivot = i;
    for (let r = i + 1; r < n; r += 1) {
      if (Math.abs((A[r] as number[])[i] ?? 0) > Math.abs((A[pivot] as number[])[i] ?? 0)) pivot = r;
    }
    if (Math.abs((A[pivot] as number[])[i] ?? 0) < 1e-10) return null;
    [A[i], A[pivot]] = [A[pivot] as number[], A[i] as number[]];
    [b[i], b[pivot]] = [b[pivot] as number, b[i] as number];
    const row = A[i] as number[];
    const div = row[i] as number;
    for (let c = i; c < n; c += 1) row[c] = (row[c] as number) / div;
    b[i] = (b[i] as number) / div;
    for (let r = 0; r < n; r += 1) {
      if (r === i) continue;
      const other = A[r] as number[];
      const factor = other[i] as number;
      if (!factor) continue;
      for (let c = i; c < n; c += 1) other[c] = (other[c] as number) - factor * (row[c] as number);
      b[r] = (b[r] as number) - factor * (b[i] as number);
    }
  }
  return b;
}

/* ------------------------------------------------------------- filtre document */

/**
 * Filtre "document" : estimation du fond par flou large (division = fond blanchi),
 * puis courbe de niveaux pour foncer le texte. Les couleurs sont conservées.
 */
function enhance(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const count = width * height;

  const luma = new Float32Array(count);
  const chroma = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    chroma[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }

  const radius = Math.max(4, Math.round(Math.max(width, height) / 22));
  const background = boxBlurMax(luma, width, height, radius);

  // Le contenu est-il déjà en niveaux de gris ?
  let colored = 0;
  for (let i = 0; i < count; i += 1) if ((chroma[i] ?? 0) > 26) colored += 1;
  const keepColor = colored > count * 0.02;

  const black = 0.42; // point noir de la courbe (fraction du fond)
  const white = 0.94; // point blanc

  for (let i = 0; i < count; i += 1) {
    const bg = Math.max(40, background[i] ?? 255);
    const normalized = (luma[i] ?? 0) / bg;
    let level = (normalized - black) / (white - black);
    level = level <= 0 ? 0 : level >= 1 ? 1 : level * level * (3 - 2 * level); // léger S-curve
    const targetLuma = level * 255;
    const currentLuma = Math.max(1, luma[i] ?? 1);
    const gain = targetLuma / currentLuma;
    const offset = i * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      const value = (data[offset + channel] ?? 0) * gain;
      data[offset + channel] = keepColor ? value : targetLuma;
    }
    data[offset + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

/** Flou (moyenne) séparable sur la version « claire » de l'image, pour estimer le papier. */
function boxBlurMax(luma: Float32Array, width: number, height: number, radius: number): Float32Array {
  // dilatation légère : on prend le maximum local sur une grille grossière puis on lisse.
  const step = Math.max(1, Math.round(radius / 2));
  const gw = Math.ceil(width / step);
  const gh = Math.ceil(height / step);
  const coarse = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      let max = 0;
      const y1 = Math.min(height, (gy + 1) * step);
      const x1 = Math.min(width, (gx + 1) * step);
      for (let y = gy * step; y < y1; y += 1) {
        for (let x = gx * step; x < x1; x += 1) {
          const value = luma[y * width + x] ?? 0;
          if (value > max) max = value;
        }
      }
      coarse[gy * gw + gx] = max;
    }
  }

  const blurred = blurGrid(coarse, gw, gh, Math.max(1, Math.round(radius / step)));

  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const gy = Math.min(gh - 1, Math.floor(y / step));
    for (let x = 0; x < width; x += 1) {
      const gx = Math.min(gw - 1, Math.floor(x / step));
      out[y * width + x] = blurred[gy * gw + gx] ?? 255;
    }
  }
  return out;
}

function blurGrid(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let n = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        sum += src[y * w + xx] ?? 0;
        n += 1;
      }
      tmp[y * w + x] = sum / Math.max(1, n);
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let n = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        sum += tmp[yy * w + x] ?? 0;
        n += 1;
      }
      out[y * w + x] = sum / Math.max(1, n);
    }
  }
  return out;
}
