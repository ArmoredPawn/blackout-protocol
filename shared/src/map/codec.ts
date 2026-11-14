import type { MapDefinition } from "./types.js";

/** Share codes: "BPM1." + base64url(deflate-raw(JSON)). Works in browsers and Node ≥ 18. */
const PREFIX = "BPM1.";
export const MAX_SHARE_CODE_LEN = 200_000;
export const MAX_MAP_JSON_LEN = 400_000;

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error("Data too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export async function encodeMapCode(map: MapDefinition): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(map));
  return PREFIX + toB64Url(await pipe(json, new CompressionStream("deflate-raw"), MAX_MAP_JSON_LEN * 2));
}

/** Returns parsed (unvalidated) JSON. Always run validateMap() on the result. */
export async function decodeMapCode(code: string): Promise<unknown> {
  const s = code.trim();
  if (!s.startsWith(PREFIX) || s.length > MAX_SHARE_CODE_LEN) throw new Error("Not a map code");
  const raw = await pipe(fromB64Url(s.slice(PREFIX.length)), new DecompressionStream("deflate-raw"), MAX_MAP_JSON_LEN);
  return JSON.parse(new TextDecoder().decode(raw));
}
