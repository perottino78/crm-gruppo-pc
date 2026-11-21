// Province, comuni e CAP italiani: ricava la provincia di un contatto dal suo comune o dal suo CAP e prepara i valori con cui cercarlo nel database
// (richiesta di Ugo 20/11/2026: scegliere più province e più paesi per il pubblico delle campagne). Modulo puro, usato solo lato server per i dati grandi.
import { PROVINCE } from "./province";
import { COMUNI_PER_PROVINCIA, CAP_PER_PROVINCIA } from "./comuni-data";

import { normalizza } from "./normalizza";
export { normalizza };

const SIGLE = new Set(PROVINCE.map((p) => p.sigla));
const ALIAS: Record<string, string> = {
  "monza": "MB", "monza brianza": "MB", "bolzano": "BZ", "bozen": "BZ", "sud tirol": "BZ", "aosta": "AO", "valle d aosta": "AO",
  "reggio emilia": "RE", "reggio calabria": "RC", "forli": "FC", "cesena": "FC", "pesaro": "PU", "urbino": "PU", "massa": "MS", "carrara": "MS",
  "verbania": "VB", "ossola": "VB", "barletta": "BT", "andria": "BT", "trani": "BT", "ascoli": "AP", "fermo": "FM", "olbia": "SS", "tempio pausania": "SS",
  "carbonia": "SU", "iglesias": "SU", "sulcis": "SU", "medio campidano": "SU", "ogliastra": "NU", "pordenone": "PN", "cagliari": "CA",
};
const PER_NOME = new Map<string, string>();
for (const p of PROVINCE) {
  PER_NOME.set(normalizza(p.nome), p.sigla);
  for (const parte of p.nome.split("/")) PER_NOME.set(normalizza(parte), p.sigla);
}

/** Sigla della provincia da come è scritta («TO», «to», «(TO)», «Torino», «Reggio Emilia»); null se non si riconosce. */
export function siglaDaTesto(t: string | null | undefined): string | null {
  const grezzo = (t ?? "").trim();
  if (!grezzo) return null;
  const s = grezzo.toUpperCase().replace(/[().\s]/g, "");
  if (/^[A-Z]{2}$/.test(s)) return SIGLE.has(s) ? s : null;
  const n = normalizza(grezzo.replace(/^provincia\s+di\s+/i, "").replace(/^prov\.?\s+/i, ""));
  return PER_NOME.get(n) ?? ALIAS[n] ?? null;
}

let mappaCap: Map<string, string> | null = null;
let mappaPrefissi: Map<string, string> | null = null;
function caricaCap() {
  if (mappaCap) return;
  mappaCap = new Map();
  const per3 = new Map<string, Set<string>>();
  for (const [sigla, intervalli] of Object.entries(CAP_PER_PROVINCIA)) {
    for (const pezzo of intervalli.split(",")) {
      const [a, b] = pezzo.split("-");
      const da = Number(a), fino = Number(b ?? a);
      for (let n = da; n <= fino; n++) {
        const c = String(n).padStart(5, "0");
        mappaCap.set(c, sigla);
        const k = c.slice(0, 3);
        if (!per3.has(k)) per3.set(k, new Set());
        per3.get(k)!.add(sigla);
      }
    }
  }
  mappaPrefissi = new Map();
  for (const [k, set] of per3) if (set.size === 1) mappaPrefissi.set(k, [...set][0]);
}

/** Provincia dal CAP (anche se Excel ha tolto lo zero davanti, come in 0118 per 00118). Per i CAP non in elenco guarda le prime tre cifre se sono di una sola provincia. */
export function provinciaDaCap(cap: string | null | undefined): string | null {
  const cifre = (cap ?? "").replace(/\D/g, "");
  if (cifre.length < 4 || cifre.length > 5) return null;
  caricaCap();
  const c = cifre.padStart(5, "0");
  return mappaCap!.get(c) ?? mappaPrefissi!.get(c.slice(0, 3)) ?? null;
}

let mappaComuni: Map<string, string> | null = null;
function caricaComuni() {
  if (mappaComuni) return;
  mappaComuni = new Map();
  const dup = new Set<string>();
  for (const [sigla, elenco] of Object.entries(COMUNI_PER_PROVINCIA)) {
    for (const nome of elenco.split("|")) {
      const k = normalizza(nome);
      if (mappaComuni.has(k) && mappaComuni.get(k) !== sigla) dup.add(k);
      mappaComuni.set(k, sigla);
    }
  }
  for (const k of dup) mappaComuni.delete(k); // stesso nome in due province (Calliano, Castro…): non si indovina
}

/** Provincia dal comune. Accetta anche «Rosta (TO)» e «Rosta TO»; i nomi uguali in due province non si indovinano. */
export function provinciaDaComune(comune: string | null | undefined): string | null {
  const grezzo = (comune ?? "").trim();
  if (!grezzo) return null;
  const tra = grezzo.match(/[(\[]\s*([A-Za-z]{2})\s*[)\]]\s*$/);
  if (tra && SIGLE.has(tra[1].toUpperCase())) return tra[1].toUpperCase();
  caricaComuni();
  const n = normalizza(grezzo);
  const diretto = mappaComuni!.get(n);
  if (diretto) return diretto;
  const coda = n.match(/^(.*\S)\s+([a-z]{2})$/);
  if (coda && SIGLE.has(coda[2].toUpperCase())) return coda[2].toUpperCase();
  return null;
}

/** La provincia di un contatto: quella scritta, altrimenti dal CAP, altrimenti dal comune. */
export function provinciaDelContatto(c: { provincia?: string | null; comune?: string | null; cap?: string | null }): string | null {
  return siglaDaTesto(c.provincia) ?? provinciaDaCap(c.cap) ?? provinciaDaComune(c.comune);
}

export { scritturePerRicerca } from "./scritture";
