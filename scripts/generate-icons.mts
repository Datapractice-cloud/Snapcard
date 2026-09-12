/**
 * Draws the PWA icons into public/icons/.
 *
 *   npm run icons
 *
 * Written by hand rather than pulled from an image library: the mark is six
 * rectangles and a circle, and a build-time native dependency for that is a
 * worse trade than sixty lines of arithmetic. Re-run it if the mark changes.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BRAND = [0x1d, 0x4e, 0xd8] as const;
const WHITE = [0xff, 0xff, 0xff] as const;

/** Each pixel is averaged from this many samples per axis, to soften edges. */
const SUPERSAMPLE = 4;

type Rgb = readonly [number, number, number];

type Shape = {
  /** Coverage of this shape at a point, 0..1, in the 512-unit design space. */
  at: (x: number, y: number) => boolean;
  colour: Rgb;
  alpha: number;
};

function roundedRect(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  return (px: number, py: number): boolean => {
    if (px < x || py < y || px > x + w || py > y + h) return false;

    // Inside the straight edges of the cross shape, no corner test needed.
    const nearLeft = px < x + radius;
    const nearRight = px > x + w - radius;
    const nearTop = py < y + radius;
    const nearBottom = py > y + h - radius;
    if ((!nearLeft && !nearRight) || (!nearTop && !nearBottom)) return true;

    const cx = nearLeft ? x + radius : x + w - radius;
    const cy = nearTop ? y + radius : y + h - radius;
    return (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2;
  };
}

function circle(cx: number, cy: number, r: number) {
  return (px: number, py: number): boolean => (px - cx) ** 2 + (py - cy) ** 2 <= r ** 2;
}

/** A stroked rounded rect: inside the outer path but outside the inner one. */
function roundedRectOutline(x: number, y: number, w: number, h: number, r: number, stroke: number) {
  const half = stroke / 2;
  const outer = roundedRect(x - half, y - half, w + stroke, h + stroke, r + half);
  const inner = roundedRect(x + half, y + half, w - stroke, h - stroke, Math.max(0, r - half));
  return (px: number, py: number): boolean => outer(px, py) && !inner(px, py);
}

/** The mark itself, in a 512-unit space. Mirrors snapcard-prototypes/icon.svg. */
function markShapes(): Shape[] {
  return [
    { at: roundedRectOutline(116, 166, 280, 180, 24, 26), colour: WHITE, alpha: 1 },
    { at: circle(186, 236, 26), colour: WHITE, alpha: 1 },
    { at: roundedRect(238, 218, 120, 18, 9), colour: WHITE, alpha: 0.9 },
    { at: roundedRect(238, 252, 88, 14, 7), colour: WHITE, alpha: 0.6 },
    { at: roundedRect(150, 296, 208, 14, 7), colour: WHITE, alpha: 0.6 },
  ];
}

type Options = {
  size: number;
  /**
   * Maskable icons are cropped to whatever shape the launcher wants, so the
   * background runs to the edges and the mark shrinks into the safe zone.
   */
  maskable?: boolean;
};

function render({ size, maskable = false }: Options): Buffer {
  const background = maskable
    ? () => true
    : roundedRect(0, 0, 512, 512, 112);

  // Android's maskable safe zone is the middle 80%; 0.7 leaves room to spare.
  const scale = maskable ? 0.7 : 1;
  const shapes = markShapes();

  const pixels = Buffer.alloc(size * size * 4);
  const step = 512 / size / SUPERSAMPLE;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const dx = (px * SUPERSAMPLE + sx + 0.5) * step;
          const dy = (py * SUPERSAMPLE + sy + 0.5) * step;

          if (!background(dx, dy)) continue;

          // Start on the brand square, then paint the mark over it.
          let [cr, cg, cb] = BRAND;
          // Shrink the mark about the centre for maskable icons.
          const mx = (dx - 256) / scale + 256;
          const my = (dy - 256) / scale + 256;

          for (const shape of shapes) {
            if (!shape.at(mx, my)) continue;
            cr = Math.round(cr + (shape.colour[0] - cr) * shape.alpha);
            cg = Math.round(cg + (shape.colour[1] - cg) * shape.alpha);
            cb = Math.round(cb + (shape.colour[2] - cb) * shape.alpha);
          }

          r += cr;
          g += cg;
          b += cb;
          a += 255;
        }
      }

      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const coverage = a / samples / 255;
      const offset = (py * size + px) * 4;
      // Averaged over covered samples only, so edges fade in alpha not colour.
      pixels[offset] = coverage > 0 ? Math.round(r / (a / 255)) : 0;
      pixels[offset + 1] = coverage > 0 ? Math.round(g / (a / 255)) : 0;
      pixels[offset + 2] = coverage > 0 ? Math.round(b / (a / 255)) : 0;
      pixels[offset + 3] = Math.round(coverage * 255);
    }
  }

  return encodePng(pixels, size);
}

/* ---- A minimal PNG encoder: signature, IHDR, IDAT, IEND. ---- */

function encodePng(pixels: Buffer, size: number): Buffer {
  // PNG rows are prefixed with a filter byte; 0 means "none".
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ---- ICO, so /favicon.ico is the SnapCard mark and not a stray default ---- */

/**
 * Windows ICO wrapping PNG frames rather than BMP: every browser still in use
 * reads PNG-in-ICO, and it means reusing the encoder above instead of writing
 * a second one for a format with upside-down rows.
 */
function encodeIco(frames: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(frames.length, 4);

  let offset = 6 + frames.length * 16;
  const entries: Buffer[] = [];

  for (const frame of frames) {
    const entry = Buffer.alloc(16);
    // 0 means 256 in this field; none of our frames are that large, but the
    // rule is the reason the byte is written rather than assigned directly.
    entry[0] = frame.size >= 256 ? 0 : frame.size;
    entry[1] = frame.size >= 256 ? 0 : frame.size;
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(frame.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += frame.png.length;
  }

  return Buffer.concat([header, ...entries, ...frames.map((frame) => frame.png)]);
}

/* ---- Write them ---- */

const out = "public/icons";
mkdirSync(out, { recursive: true });

const files: [string, Options][] = [
  ["icon-192.png", { size: 192 }],
  ["icon-512.png", { size: 512 }],
  ["maskable-512.png", { size: 512, maskable: true }],
  // iOS applies its own rounding and does not understand transparency here.
  ["apple-touch-icon.png", { size: 180, maskable: true }],
];

for (const [name, options] of files) {
  const png = render(options);
  writeFileSync(`${out}/${name}`, png);
  console.log(`${out}/${name}  ${options.size}x${options.size}  ${(png.length / 1024).toFixed(1)} KB`);
}

/*
 * The browser tab and anything that falls back to /favicon.ico. Written into
 * src/app so Next serves it by its file convention; without it the tab shows
 * whatever favicon create-next-app left behind, which is not this app.
 */
const ico = encodeIco([16, 32, 48].map((size) => ({ size, png: render({ size }) })));
writeFileSync("src/app/favicon.ico", ico);
console.log("  src/app/favicon.ico");
