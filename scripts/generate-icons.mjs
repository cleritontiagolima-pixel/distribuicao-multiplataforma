// CTUBE icon generator — red rounded square with a white "C".
//
// Generates every icon the app needs, with zero external dependencies:
//   - default:        public/*.png, public/favicon.ico, public/icon.svg
//   - --android DIR:  launcher icons into an Android res/ directory
//                     (ic_launcher*.png + adaptive foreground + background color)
//   - --ios DIR:      AppIcon.appiconset (single-size 1024px + Contents.json)
//
// The bitmap is painted procedurally (rounded rect + stroked arc = "C") with
// 2x2 supersampling for antialiasing, then encoded as PNG (node:zlib deflate)
// and ICO (PNG-compressed entries, supported on Windows Vista+).
//
// Usage:
//   node scripts/generate-icons.mjs
//   node scripts/generate-icons.mjs --android android/app/src/main/res
//   node scripts/generate-icons.mjs --ios ios/App/App/Assets.xcassets/AppIcon.appiconset

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const RED = [255, 78, 69]; // #FF4E45 — CTUBE primary

// ---------------------------------------------------------------------------
// PNG encoder (RGBA, 8-bit, filter 0)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePng(rgba, w, h) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(
      raw,
      y * stride + 1
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Icon painter: red rounded square + white "C" (stroked arc with round caps)
// ---------------------------------------------------------------------------
export function paintIcon(size, { maskable = false } = {}) {
  const px = new Uint8Array(size * size * 4);
  const r = maskable ? 0 : size * 0.2071; // corner radius (matches rx=37/180)
  const scale = maskable ? 0.82 : 1; // keep glyph inside the maskable safe zone
  const R = size * 0.31 * scale; // C arc radius
  const W = size * 0.165 * scale; // C stroke width
  const A0 = 0.845; // half-opening angle of the C (rad)
  const cx = size / 2;
  const cy = size / 2;
  const half = size / 2;
  const endX = R * Math.cos(A0);
  const endY = R * Math.sin(A0);

  const inBg = (x, y) => {
    const qx = Math.abs(x - cx) - (half - r);
    const qy = Math.abs(y - cy) - (half - r);
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const d = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
    return d < 0;
  };
  const inC = (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    if (Math.abs(Math.hypot(dx, dy) - R) <= W / 2) {
      const ang = Math.atan2(dy, dx);
      if (Math.abs(ang) >= A0) return true;
    }
    // round caps at both ends of the arc
    if (Math.hypot(dx - endX, dy - endY) <= W / 2) return true;
    if (Math.hypot(dx - endX, dy + endY) <= W / 2) return true;
    return false;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgHits = 0;
      let cHits = 0;
      for (const sx of [-0.25, 0.25]) {
        for (const sy of [-0.25, 0.25]) {
          const X = x + 0.5 + sx;
          const Y = y + 0.5 + sy;
          if (inBg(X, Y)) {
            bgHits++;
            if (inC(X, Y)) cHits++;
          }
        }
      }
      const i = (y * size + x) * 4;
      if (bgHits === 0) {
        px[i + 3] = 0;
        continue;
      }
      const mix = cHits / bgHits;
      px[i] = Math.round(RED[0] + (255 - RED[0]) * mix);
      px[i + 1] = Math.round(RED[1] + (255 - RED[1]) * mix);
      px[i + 2] = Math.round(RED[2] + (255 - RED[2]) * mix);
      px[i + 3] = Math.round((bgHits / 4) * 255);
    }
  }
  return px;
}

function writePng(path, size, opts) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(paintIcon(size, opts), size, size));
}

// Blit a rendered icon into the center of a transparent canvas.
function centered(innerRgba, innerSize, canvasSize) {
  const out = new Uint8Array(canvasSize * canvasSize * 4);
  const off = Math.floor((canvasSize - innerSize) / 2);
  for (let y = 0; y < innerSize; y++) {
    const src = y * innerSize * 4;
    out.set(
      innerRgba.subarray(src, src + innerSize * 4),
      (y + off) * canvasSize * 4 + off * 4
    );
  }
  return out;
}

function writeIco(path) {
  const sizes = [16, 32, 48, 256];
  const entries = sizes.map((s) => ({ s, png: encodePng(paintIcon(s), s, s) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach((e, idx) => {
    const o = idx * 16;
    dir[o] = e.s;
    dir.writeUInt16LE(1, o + 4); // color plane
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(e.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.png.length;
  });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([header, dir, ...entries.map((e) => e.png)]));
}

// ---------------------------------------------------------------------------
// SVG master (used as favicon/manifest source and by the Electron window)
// ---------------------------------------------------------------------------
export const ICON_SVG = `<svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="180" height="180" rx="37" fill="#FF4E45"/>
  <path d="M115.2 61.6 A38 38 0 1 0 115.2 118.4" stroke="#FFFFFF" stroke-width="27" stroke-linecap="round" fill="none"/>
</svg>
`;

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const androidRes = arg("--android");
const iosAssets = arg("--ios");
const outDir = arg("--out") || "public";

if (!androidRes && !iosAssets) {
  // Web / Electron / manifest assets
  writePng(join(outDir, "icon-192.png"), 192);
  writePng(join(outDir, "icon-512.png"), 512);
  writePng(join(outDir, "icon-maskable-192.png"), 192, { maskable: true });
  writePng(join(outDir, "icon-maskable-512.png"), 512, { maskable: true });
  writePng(join(outDir, "icon-light-32x32.png"), 32);
  writePng(join(outDir, "icon-dark-32x32.png"), 32);
  writePng(join(outDir, "apple-icon.png"), 180);
  writePng(join(outDir, "ctube-logo.png"), 512);
  writeIco(join(outDir, "favicon.ico"));
  writeFileSync(join(outDir, "icon.svg"), ICON_SVG);
  console.log("✅ Web icons generated in", outDir);
}

if (androidRes) {
  const launcher = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
  };
  const foreground = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
  };
  for (const [dir, s] of Object.entries(launcher)) {
    writePng(join(androidRes, dir, "ic_launcher.png"), s);
    writePng(join(androidRes, dir, "ic_launcher_round.png"), s);
  }
  for (const [dir, s] of Object.entries(foreground)) {
    // Adaptive foreground: glyph inside the 66% safe zone, transparent around.
    const inner = Math.round(s * 0.66);
    const rgba = centered(paintIcon(inner), inner, s);
    mkdirSync(join(androidRes, dir), { recursive: true });
    writeFileSync(
      join(androidRes, dir, "ic_launcher_foreground.png"),
      encodePng(rgba, s, s)
    );
  }
  // Adaptive background color (the template ships a white background).
  const bgPath = join(androidRes, "values", "ic_launcher_background.xml");
  if (existsSync(bgPath)) {
    writeFileSync(
      bgPath,
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FF4E45</color>\n</resources>\n`
    );
  }
  console.log("✅ Android launcher icons generated in", androidRes);
}

if (iosAssets) {
  writePng(join(iosAssets, "AppIcon-512@2x.png"), 1024);
  writeFileSync(
    join(iosAssets, "Contents.json"),
    JSON.stringify(
      {
        images: [
          {
            filename: "AppIcon-512@2x.png",
            idiom: "universal",
            platform: "ios",
            size: "1024x1024",
          },
        ],
        info: { author: "xcode", version: 1 },
      },
      null,
      2
    ) + "\n"
  );
  console.log("✅ iOS AppIcon generated in", iosAssets);
}
