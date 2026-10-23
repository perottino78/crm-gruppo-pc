import { createHash, createHmac } from "node:crypto";
import { constantTimeEqual } from "./signature";

const b64u = (b: Buffer) => b.toString("base64url");

/**
 * Autenticazione dell'endpoint scheduler. Due modalità, entrambe forti:
 *  - Bearer con segreto >= 32 caratteri (Vercel Cron invia Authorization: Bearer $CRON_SECRET);
 *  - firma Upstash QStash (JWT HS256 su URL + hash del corpo, con scadenza), verificata con le chiavi di firma.
 * Confronti a tempo costante. Nessun segreto nei log.
 */
export function authorizeScheduler(
  input: { authorization?: string | null; upstashSignature?: string | null; url: string; rawBody: string; nowSec: number },
  cfg: { schedulerSecret?: string; qstashKeys: string[] },
): boolean {
  const a = input.authorization ?? "";
  if (cfg.schedulerSecret && a.startsWith("Bearer ") && constantTimeEqual(a.slice(7), cfg.schedulerSecret)) return true;
  if (input.upstashSignature && cfg.qstashKeys.length > 0) return verifyQstash(input.upstashSignature, input.url, input.rawBody, input.nowSec, cfg.qstashKeys);
  return false;
}

export function verifyQstash(jwt: string, url: string, body: string, nowSec: number, keys: string[]): boolean {
  const parts = jwt.split(".");
  if (parts.length !== 3) return false;
  const [h, p, sig] = parts;
  let header: { alg?: string };
  let claims: { iss?: string; sub?: string; exp?: number; nbf?: number; body?: string };
  try {
    header = JSON.parse(Buffer.from(h, "base64url").toString());
    claims = JSON.parse(Buffer.from(p, "base64url").toString());
  } catch {
    return false;
  }
  if (header.alg !== "HS256") return false;
  const okSig = keys.some((k) => constantTimeEqual(b64u(createHmac("sha256", k).update(`${h}.${p}`).digest()), sig));
  if (!okSig) return false;
  if (claims.iss !== "Upstash" || claims.sub !== url) return false;
  if (typeof claims.exp !== "number" || nowSec > claims.exp) return false;
  if (typeof claims.nbf === "number" && nowSec + 5 < claims.nbf) return false;
  const expected = b64u(createHash("sha256").update(body).digest());
  return constantTimeEqual((claims.body ?? "").replace(/=+$/, ""), expected);
}
