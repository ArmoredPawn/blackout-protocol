import * as THREE from "three";

/**
 * Procedural greyscale detail textures (tinted by vertex colours). Generated once
 * on a small canvas – no image downloads, tiny memory footprint.
 */
const cache = new Map<string, THREE.Texture>();

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function make(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number, r: () => number) => void, repeat = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  draw(g, size, rng(key.length * 7919 + size));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

function noise(g: CanvasRenderingContext2D, s: number, r: () => number, amount: number, base = 225) {
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
  void base;
}

/** UV space: 1 unit = 1 world metre; textures cover 2 m (one cell). */
export function floorTexture(pattern: string) {
  return make(`floor-${pattern}`, 256, (g, s, r) => {
    g.fillStyle = "#e6e6e6";
    g.fillRect(0, 0, s, s);
    if (pattern === "tile") {
      g.strokeStyle = "#9a9a9a";
      g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        g.beginPath();
        g.moveTo((i * s) / 4, 0);
        g.lineTo((i * s) / 4, s);
        g.moveTo(0, (i * s) / 4);
        g.lineTo(s, (i * s) / 4);
        g.stroke();
      }
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          g.fillStyle = `rgba(0,0,0,${r() * 0.06})`;
          g.fillRect((x * s) / 4 + 2, (y * s) / 4 + 2, s / 4 - 4, s / 4 - 4);
        }
      noise(g, s, r, 14);
    } else if (pattern === "wood") {
      for (let y = 0; y < 8; y++) {
        const off = r() * s;
        g.fillStyle = `rgb(${200 + r() * 40},${200 + r() * 40},${200 + r() * 40})`;
        g.fillRect(0, (y * s) / 8, s, s / 8);
        g.fillStyle = "#8c8c8c";
        g.fillRect(0, (y * s) / 8, s, 2);
        g.fillRect(off, (y * s) / 8, 2, s / 8);
      }
      noise(g, s, r, 22);
    } else if (pattern === "carpet") {
      noise(g, s, r, 60);
      g.strokeStyle = "rgba(0,0,0,0.12)";
      g.lineWidth = 6;
      for (let i = -s; i < s * 2; i += 32) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + s, s);
        g.stroke();
      }
    } else {
      // concrete
      noise(g, s, r, 34);
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(0,0,0,${r() * 0.07})`;
        g.beginPath();
        g.arc(r() * s, r() * s, 8 + r() * 30, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 2;
      g.strokeRect(0, 0, s, s);
    }
  });
}

/** Walls: v spans one storey (4 m), u spans 2 m. */
export function wallTexture(pattern: string) {
  return make(`wall-${pattern}`, 256, (g, s, r) => {
    g.fillStyle = "#ececec";
    g.fillRect(0, 0, s, s);
    if (pattern === "brick") {
      const rows = 16;
      for (let y = 0; y < rows; y++) {
        const h = s / rows;
        const off = y % 2 ? s / 8 : 0;
        for (let x = -1; x < 4; x++) {
          g.fillStyle = `rgb(${215 + r() * 30},${215 + r() * 30},${215 + r() * 30})`;
          g.fillRect(x * (s / 4) + off + 2, y * h + 2, s / 4 - 4, h - 4);
        }
      }
      noise(g, s, r, 18);
    } else if (pattern === "panel") {
      g.fillStyle = "#d6d6d6";
      g.fillRect(0, s * 0.72, s, s * 0.28); // lower wainscot band (painted by vertex colour)
      g.strokeStyle = "#b0b0b0";
      g.lineWidth = 3;
      g.strokeRect(4, 4, s / 2 - 8, s * 0.68);
      g.strokeRect(s / 2 + 4, 4, s / 2 - 8, s * 0.68);
      g.fillStyle = "#9a9a9a";
      g.fillRect(0, s * 0.715, s, 5);
      noise(g, s, r, 10);
    } else if (pattern === "plaster") {
      noise(g, s, r, 12);
      g.fillStyle = "rgba(0,0,0,0.15)";
      g.fillRect(0, s * 0.74, s, 6);
      g.fillStyle = "rgba(0,0,0,0.08)";
      g.fillRect(0, s * 0.75, s, s * 0.25);
    } else {
      noise(g, s, r, 30);
      g.strokeStyle = "rgba(0,0,0,0.18)";
      g.lineWidth = 2;
      g.strokeRect(1, 1, s - 2, s / 2 - 2);
      g.strokeRect(1, s / 2, s - 2, s / 2 - 2);
      for (const [x, y] of [
        [12, 12],
        [s - 12, 12],
        [12, s / 2 + 12],
        [s - 12, s / 2 + 12],
      ]) {
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.beginPath();
        g.arc(x, y, 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

export function grateTexture() {
  return make("grate", 128, (g, s) => {
    g.fillStyle = "#3a3a3a";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "#cfcfcf";
    for (let i = 0; i < s; i += 8) {
      g.fillRect(i, 0, 3, s);
      g.fillRect(0, i, s, 2);
    }
  });
}

export function hazardTexture() {
  return make("hazard", 128, (g, s) => {
    g.fillStyle = "#f2c200";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "#1b1b1b";
    for (let i = -s; i < s * 2; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 16, 0);
      g.lineTo(i + 16 + s, s);
      g.lineTo(i + s, s);
      g.fill();
    }
  });
}

export function genericTexture() {
  return make("generic", 64, (g, s, r) => {
    g.fillStyle = "#eeeeee";
    g.fillRect(0, 0, s, s);
    noise(g, s, r, 12);
  });
}

/** Face decal for avatars. */
export function faceTexture(face: string, eye: string) {
  return make(
    `face-${face}-${eye}`,
    128,
    (g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = eye;
      g.strokeStyle = eye;
      g.lineCap = "round";
      g.lineWidth = 7;
      const ey = s * 0.42,
        lx = s * 0.32,
        rx = s * 0.68;
      const eyeDot = (x: number, y: number, r = 8) => {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      };
      const arc = (x: number, y: number, r: number, a0: number, a1: number) => {
        g.beginPath();
        g.arc(x, y, r, a0, a1);
        g.stroke();
      };
      switch (face) {
        case "sleepy":
          arc(lx, ey - 4, 10, 0.1 * Math.PI, 0.9 * Math.PI);
          arc(rx, ey - 4, 10, 0.1 * Math.PI, 0.9 * Math.PI);
          break;
        case "wink":
          eyeDot(lx, ey);
          arc(rx, ey + 4, 10, 1.1 * Math.PI, 1.9 * Math.PI);
          break;
        case "cool":
          g.fillRect(lx - 20, ey - 10, rx - lx + 40, 18);
          break;
        case "surprised":
          eyeDot(lx, ey, 10);
          eyeDot(rx, ey, 10);
          break;
        case "fierce":
          eyeDot(lx, ey + 2);
          eyeDot(rx, ey + 2);
          g.lineWidth = 6;
          g.beginPath();
          g.moveTo(lx - 14, ey - 18);
          g.lineTo(lx + 12, ey - 8);
          g.moveTo(rx + 14, ey - 18);
          g.lineTo(rx - 12, ey - 8);
          g.stroke();
          break;
        default:
          eyeDot(lx, ey);
          eyeDot(rx, ey);
      }
      g.lineWidth = 6;
      const my = s * 0.66;
      switch (face) {
        case "grin":
          g.beginPath();
          g.arc(s / 2, my - 10, 22, 0.05 * Math.PI, 0.95 * Math.PI);
          g.closePath();
          g.fill();
          break;
        case "determined":
        case "neutral":
          g.beginPath();
          g.moveTo(s / 2 - 16, my);
          g.lineTo(s / 2 + 16, my);
          g.stroke();
          break;
        case "surprised":
          g.beginPath();
          g.arc(s / 2, my + 2, 8, 0, Math.PI * 2);
          g.stroke();
          break;
        case "fierce":
          arc(s / 2, my + 14, 16, 1.15 * Math.PI, 1.85 * Math.PI);
          break;
        case "happy":
          arc(s / 2, my - 12, 20, 0.15 * Math.PI, 0.85 * Math.PI);
          g.fillStyle = "rgba(255,120,140,0.5)";
          eyeDot(lx - 8, my - 6, 8);
          eyeDot(rx + 8, my - 6, 8);
          break;
        default:
          arc(s / 2, my - 12, 18, 0.2 * Math.PI, 0.8 * Math.PI);
      }
    },
    false,
  );
}
