// Firma e verifica di cookie di sessione con HMAC-SHA256 via Web Crypto API.
// Isomorfo: funziona sia nel middleware (runtime Edge) sia nelle Server
// Actions/Route Handler (runtime Node.js) senza dipendenze esterne.

const SESSION_SECRET = process.env.SESSION_SECRET || "gpc-2026-session-secret-x7f2-cambiami-in-produzione";

export type SessionPayload = {
  utenteId: string;
  exp: number; // timestamp ms di scadenza
};

const encoder = new TextEncoder();

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBuffer(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function utf8ToBase64Url(str: string): string {
  return bufferToBase64Url(encoder.encode(str).buffer as ArrayBuffer);
}

function base64UrlToUtf8(b64url: string): string {
  const buf = base64UrlToBuffer(b64url);
  return new TextDecoder().decode(buf);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const key = await getKey();
  const body = utf8ToBase64Url(JSON.stringify(payload));
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const sig = bufferToBase64Url(sigBuf);
  return `${body}.${sig}`;
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  try {
    const key = await getKey();
    const valid = await crypto.subtle.verify("HMAC", key, base64UrlToBuffer(sig), encoder.encode(body));
    if (!valid) return null;
    const payload = JSON.parse(base64UrlToUtf8(body)) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (typeof payload.utenteId !== "string" || !payload.utenteId) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "gpc_session";
export const SESSION_DURATA_GIORNI = 30;
