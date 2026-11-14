/**
 * Private room codes. 8 symbols from a 31-symbol alphabet without look-alike
 * characters (no 0/O, 1/I/L) → 31^8 ≈ 8.5e11 combinations.
 * The canonical form has no dash; the display form is "ABCD-EFGH".
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

export function generateRoomCode(): string {
  const out: string[] = [];
  const buf = new Uint8Array(1);
  // Rejection sampling keeps the distribution uniform.
  const limit = 256 - (256 % CODE_ALPHABET.length);
  while (out.length < CODE_LENGTH) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) out.push(CODE_ALPHABET[buf[0] % CODE_ALPHABET.length]);
  }
  return out.join("");
}

/** Normalise user input ("abcd efgh", "ABCD-EFGH") to canonical form, or null if invalid. */
export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 32) return null;
  const s = input.toUpperCase().replace(/[\s-]/g, "");
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

export function formatRoomCode(code: string): string {
  return code.length === CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function randomToken(len = 24): string {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}
