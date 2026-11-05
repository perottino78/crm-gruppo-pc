// Moduli istantanei di Meta collegati da Impostazioni › Lead (oltre a quelli fissi nelle variabili di Vercel).
// Funzioni pure, testate in tests/meta/moduli.test.ts.
import type { MetaConfig, Downstream } from "./config";
import type { PaginaGraph } from "./graph";
import { signInternal, verifyInternal } from "./signature";

/** Un modulo collegato a P&C ONE: i suoi lead entrano nel CRM con questo marchio. */
export type ModuloMeta = { formId: string; nome: string; pageId?: string | null; brand?: string | null; attivo: boolean; da?: string | null; il?: string | null };
/** Elenco letto da Meta (dal gateway, che ha le chiavi). */
export type CatalogoMeta = { lettoIl: string; pagine: PaginaGraph[] };
export type Scartati = Record<string, { n: number; ultimo: string; pageId: string }>;
/** Pagina Facebook collegata da P&C ONE con la sua chiave (cifrata nel database). */
export type PaginaCollegata = { id: string; nome: string; brand?: string | null; token?: string | null; il?: string | null };

export const CHIAVE_MODULI = "meta_moduli";
export const CHIAVE_CATALOGO = "meta_catalogo";
export const CHIAVE_GATEWAY = "meta_gateway_url";
export const CHIAVE_SCARTATI = "meta_scartati";
export const CHIAVE_PAGINE = "meta_pagine";

const ID = /^\d{5,25}$/;

export function leggiModuli(json: string | null | undefined): ModuloMeta[] {
  try {
    const v = JSON.parse(json ?? "[]");
    if (!Array.isArray(v)) return [];
    return v
      .filter((m) => m && typeof m.formId === "string" && ID.test(m.formId))
      .map((m) => ({ formId: m.formId, nome: String(m.nome ?? "").slice(0, 200) || `Modulo ${m.formId}`, pageId: typeof m.pageId === "string" ? m.pageId : null, brand: typeof m.brand === "string" && m.brand ? m.brand : null, attivo: m.attivo !== false, da: m.da ?? null, il: m.il ?? null }));
  } catch {
    return [];
  }
}

/** Aggiunge o aggiorna un modulo (per ID) senza toccare gli altri. */
export function aggiornaModulo(lista: ModuloMeta[], m: ModuloMeta): ModuloMeta[] {
  if (!ID.test(m.formId)) return lista;
  const i = lista.findIndex((x) => x.formId === m.formId);
  return i < 0 ? [...lista, m] : lista.map((x, j) => (j === i ? { ...x, ...m } : x));
}

/** Configurazione effettiva: moduli e pagine delle variabili di Vercel + quelli collegati dal CRM (con il loro marchio). */
export function unisciModuli(cfg: MetaConfig, moduli: ModuloMeta[], pagine: PaginaCollegata[] = []): MetaConfig {
  const attivi = moduli.filter((m) => m.attivo);
  const allowed = [...new Set([...cfg.allowedFormIds, ...attivi.map((m) => m.formId)])];
  const formBrands = { ...cfg.formBrands };
  for (const m of attivi) if (m.brand) formBrands[m.formId] = m.brand;
  const pageIds = [...new Set([...cfg.pageIds, ...pagine.map((p) => p.id)])];
  const pageBrands = { ...cfg.pageBrands };
  for (const p of pagine) if (p.brand) pageBrands[p.id] = p.brand;
  return { ...cfg, allowedFormIds: allowed, formBrands, pageIds, pageId: cfg.pageId ?? pageIds[0], pageBrands };
}

export function leggiPagine(json: string | null | undefined): PaginaCollegata[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((p) => p && typeof p.id === "string" && ID.test(p.id)).map((p) => ({ id: p.id, nome: String(p.nome ?? p.id).slice(0, 200), brand: typeof p.brand === "string" ? p.brand : null, token: typeof p.token === "string" ? p.token : null, il: p.il ?? null })) : [];
  } catch {
    return [];
  }
}

/** Marchio proposto per una pagina dal suo nome (es. «Solaris Energia» → Solaris). */
export function marchioDaNome(nome: string, marchi: string[], predefinito: string): string {
  const n = nome.toLowerCase();
  return marchi.find((m) => m !== predefinito && n.includes(m.toLowerCase())) ?? predefinito;
}

/** Il destinatario del gateway che è P&C ONE (riconosciuto dall'indirizzo di ricezione). */
export function destinatarioOne(cfg: Pick<MetaConfig, "downstreams">): Downstream | null {
  return cfg.downstreams.find((d) => /\/api\/lead\/meta\/internal\/?$/.test(new URL(d.url).pathname)) ?? null;
}
export const baseDi = (url: string) => new URL(url).origin;

/** Intestazioni firmate (stesso schema degli eventi interni: v1=HMAC(segreto, "<ts>.<corpo>")). */
export function intestazioniFirmate(segreto: string, corpo: string, nowSec = Math.floor(Date.now() / 1000)): Record<string, string> {
  const ts = String(nowSec);
  return { "content-type": "application/json", "x-gpc-timestamp": ts, "x-gpc-signature": signInternal(segreto, ts, corpo) };
}
export function firmaValida(segreti: (string | undefined)[], ts: string | null, firma: string | null, corpo: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  return segreti.some((s) => !!s && verifyInternal(s, ts, firma, corpo, nowSec));
}

/** Annota un evento di un modulo non collegato (quante volte, l'ultima). */
export function annotaScartato(s: Scartati, ev: { formId: string; pageId: string }, quando: Date): Scartati {
  const prima = s[ev.formId];
  return { ...s, [ev.formId]: { n: (prima?.n ?? 0) + 1, ultimo: quando.toISOString(), pageId: ev.pageId } };
}

/** Il catalogo arrivato dal gateway, ripulito (solo ID numerici e testi corti). */
export function pulisciCatalogo(v: unknown): CatalogoMeta | null {
  const c = v as { pagine?: unknown; lettoIl?: unknown } | null;
  if (!c || !Array.isArray(c.pagine)) return null;
  const pagine: PaginaGraph[] = [];
  for (const p of c.pagine.slice(0, 20) as Record<string, unknown>[]) {
    if (!p || typeof p.id !== "string" || !ID.test(p.id)) continue;
    const moduli = (Array.isArray(p.moduli) ? (p.moduli as Record<string, unknown>[]) : [])
      .filter((m) => m && typeof m.id === "string" && ID.test(m.id))
      .slice(0, 300)
      .map((m) => ({ id: m.id as string, nome: String(m.nome ?? "").slice(0, 200), stato: typeof m.stato === "string" ? m.stato.slice(0, 30) : null, leadTotali: typeof m.leadTotali === "number" ? m.leadTotali : null, creatoIl: typeof m.creatoIl === "string" ? m.creatoIl.slice(0, 40) : null }));
    pagine.push({ id: p.id, nome: typeof p.nome === "string" ? p.nome.slice(0, 200) : null, moduli, ...(typeof p.errore === "string" ? { errore: p.errore.slice(0, 60) } : {}), ...(typeof p.iscritta === "boolean" ? { iscritta: p.iscritta } : {}) });
  }
  return { lettoIl: typeof c.lettoIl === "string" ? c.lettoIl : new Date().toISOString(), pagine };
}

/** Spiegazione semplice dei codici d'errore di Meta. */
export function spiegaErrore(code: string | null | undefined): string {
  if (!code) return "";
  if (code === "config_missing") return "Nel gateway mancano le chiavi di Meta.";
  if (code === "graph_network") return "Meta non risponde: riprova tra poco.";
  if (/_c190$/.test(code)) return "La chiave di Meta è scaduta o non valida: incollane una nuova («Chiave di Meta» qui sotto).";
  if (code === "chiave_non_valida") return "Il testo incollato non sembra una chiave di Meta.";
  if (code === "app_diversa") return "La chiave è stata generata per un'altra app: nello strumento di Meta scegli l'app «CRM Interno P&C».";
  if (code.startsWith("permessi_mancanti:")) return `Nella chiave mancano queste autorizzazioni: ${code.slice(18).split(",").join(", ")}. Rigenerala aggiungendole in «Autorizzazioni» e spunta le pagine nella finestra di Facebook.`;
  if (code === "nessuna_pagina") return "La chiave non dà accesso a nessuna pagina. Rigenerala e, nella finestra di Facebook che si apre, premi «Modifica impostazioni» / «Scegli le pagine» e spunta Gruppo P&C e Solaris (e il Business Gruppo P&C). Serve che il tuo profilo sia amministratore di quelle pagine.";
  if (/_c(10|200|283|299)$/.test(code)) return "L'app di P&C ONE non ha il permesso su questa pagina: in Meta Business, Impostazioni › Accesso ai lead, dai l'accesso al CRM.";
  if (/_c100$/.test(code)) return "Meta non fa vedere questa pagina con la chiave attuale: incolla una chiave che comprenda anche questa pagina.";
  return `Errore di Meta (${code}).`;
}
