import { randomBytes } from "crypto";

/** Compact, sortable-enough unique id: base36 time + random tail. */
export function newId(prefix = ""): string {
  const t = Date.now().toString(36);
  const r = randomBytes(6).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  return `${prefix}${t}${r}`;
}
