/** Procedural low-res textures for warehouse 3D (no image assets). */

function canvas(size: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    return c;
  }
  return new OffscreenCanvas(size, size);
}

function ctx2d(c: HTMLCanvasElement | OffscreenCanvas) {
  return c.getContext("2d")!;
}

export function makeBrickTexture(opts?: {
  size?: number;
  base?: string;
  mortar?: string;
  variation?: number;
}): HTMLCanvasElement | OffscreenCanvas {
  const size = opts?.size ?? 256;
  const base = opts?.base ?? "#c4b09a";
  const mortar = opts?.mortar ?? "#9a9088";
  const variation = opts?.variation ?? 18;
  const c = canvas(size);
  const ctx = ctx2d(c);
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, size, size);

  const bw = size / 8;
  const bh = size / 16;
  for (let row = 0; row < 16; row++) {
    const offset = row % 2 === 0 ? 0 : bw / 2;
    for (let col = -1; col < 9; col++) {
      const x = col * bw + offset;
      const y = row * bh;
      const n =
        ((row * 17 + col * 31) % variation) - variation / 2;
      ctx.fillStyle = shade(base, n);
      ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
  }
  return c;
}

export function makeConcreteTexture(size = 256): HTMLCanvasElement | OffscreenCanvas {
  const c = canvas(size);
  const ctx = ctx2d(c);
  ctx.fillStyle = "#a8a49c";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = (i * 47) % size;
    const y = (i * 91) % size;
    const a = 0.04 + ((i * 13) % 10) / 120;
    ctx.fillStyle = `rgba(60,55,50,${a})`;
    ctx.fillRect(x, y, 1 + (i % 3), 1 + (i % 2));
  }
  // seams
  ctx.strokeStyle = "rgba(70,68,64,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.5);
  ctx.lineTo(size, size * 0.5);
  ctx.moveTo(size * 0.33, 0);
  ctx.lineTo(size * 0.33, size);
  ctx.moveTo(size * 0.66, 0);
  ctx.lineTo(size * 0.66, size);
  ctx.stroke();
  return c;
}

export function makeWoodTexture(size = 128): HTMLCanvasElement | OffscreenCanvas {
  const c = canvas(size);
  const ctx = ctx2d(c);
  ctx.fillStyle = "#8b6a45";
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    const n = Math.sin(y * 0.35) * 8 + ((y * 7) % 5);
    ctx.fillStyle = shade("#9a7750", n);
    ctx.fillRect(0, y, size, 1);
  }
  return c;
}

export function makeCardboardTexture(size = 64): HTMLCanvasElement | OffscreenCanvas {
  const c = canvas(size);
  const ctx = ctx2d(c);
  ctx.fillStyle = "#c4a06a";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  for (let x = 0; x < size; x += 3) {
    ctx.fillRect(x, 0, 1, size);
  }
  // fake label
  ctx.fillStyle = "#f5f5f0";
  ctx.fillRect(size * 0.55, size * 0.2, size * 0.35, size * 0.28);
  return c;
}

function shade(hex: string, delta: number): string {
  const n = hex.replace("#", "");
  const r = Math.max(0, Math.min(255, parseInt(n.slice(0, 2), 16) + delta));
  const g = Math.max(0, Math.min(255, parseInt(n.slice(2, 4), 16) + delta));
  const b = Math.max(0, Math.min(255, parseInt(n.slice(4, 6), 16) + delta));
  return `rgb(${r},${g},${b})`;
}
