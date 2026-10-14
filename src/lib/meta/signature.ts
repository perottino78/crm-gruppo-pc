import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  // Confronto in tempo costante anche con lunghezze diverse (hash di entrambi).
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}
export const constantTimeEqual = safeEqual;

export function metaSignature(raw: Buffer | string, appSecret: string): string {
  return "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
}

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(corpo grezzo, App Secret). */
export function verifyMetaSignature(raw: Buffer | string, header: string | null | undefined, appSecret: string | undefined): boolean {
  if (!header || !appSecret) return false;
  if (!/^sha256=[0-9a-fA-F]{64}$/.test(header)) return false;
  return safeEqual(metaSignature(raw, appSecret), header.toLowerCase());
}

/** appsecret_proof = HMAC-SHA256(access token, App Secret) in esadecimale. */
export function appSecretProof(accessToken: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

// ---- Firma degli eventi interni gateway → CRM (segreto diverso per ciascun CRM) ----
export function signInternal(secret: string, timestamp: string, body: string): string {
  return "v1=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyInternal(
  secret: string | undefined,
  timestamp: string | null | undefined,
  signature: string | null | undefined,
  body: string,
  nowSec: number,
  toleranceSec = 300,
): boolean {
  if (!secret || !timestamp || !signature) return false;
  if (!/^\d{9,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSec - Number(timestamp)) > toleranceSec) return false;
  if (!/^v1=[0-9a-f]{64}$/i.test(signature)) return false;
  return safeEqual(signInternal(secret, timestamp, body), signature.toLowerCase());
}
