// Dallo Studio all'offerta: righe del fotovoltaico (pannelli, inverter, batteria, installazione, kit) e foto del tetto con i pannelli.
// Usato da «← Torna al preventivo» dello Studio (rotta /api/solaris/progetto/[id]/offerta) e da «↓ Importa nel preventivo».
// Rifacendolo non si raddoppia nulla: le righe portate prima dallo Studio (testo che inizia con «☀️ », senza prodotto) vengono sostituite.
import { prisma } from "@/lib/prisma";
import { getSolarisLivello, isAmministratore } from "@/lib/auth";
import { ricalcolaTotali } from "@/lib/preventivi/totali";
import { moduliPer } from "@/lib/solaris/stealth";
import type { Utente } from "@prisma/client";

export const SEGNO_STUDIO = "☀️ ";
/** Indirizzo con cui l'offerta (anche quella aperta dal cliente) mostra la foto del tetto salvata in SolarisFoto. */
export const urlFotoOfferta = (fotoId: string) => `/api/solaris/foto/${fotoId}`;

export type RigaStudio = { testoLibero: string; quantita: number; prezzoUnitario: number };

/** Componente come lo descrive lo Studio (pannelli di serie che non sono nel catalogo del CRM). */
export type ComponenteStudio = { nome: string; potenzaW?: number; prezzo?: number };

export type DatiProgetto = {
  kwp: number | null;
  numeroPannelli: number | null;
  batteria: number | null;
  costoKwp: number | null;
  costoBatteria: number | null;
  stato: Record<string, unknown> | null;
  pannello: { nome: string; potenzaW: number; prezzoVendita: number | null } | null;
  inverter: { nome: string; prezzoVendita: number | null } | null;
  batteriaModello: { nome: string; potenzaW: number; prezzoVendita: number } | null;
};

const fmt2 = (n: number) => n.toFixed(2).replace(".", ",");

/** Righe dell'offerta dai dati del progetto (puro). */
export function righeDaProgetto(d: DatiProgetto): RigaStudio[] {
  const righe: RigaStudio[] = [];
  const kwp = d.kwp ?? 0;
  if (d.pannello && d.numeroPannelli) {
    righe.push({
      testoLibero: `${SEGNO_STUDIO}Pannello ${d.pannello.nome}${d.pannello.potenzaW ? ` ${d.pannello.potenzaW}W` : ""} — ${d.numeroPannelli} pz (${fmt2(kwp)} kWp totali)`,
      quantita: d.numeroPannelli,
      prezzoUnitario: d.pannello.prezzoVendita ?? 0,
    });
  }
  if (d.inverter) righe.push({ testoLibero: `${SEGNO_STUDIO}Inverter ${d.inverter.nome}`, quantita: 1, prezzoUnitario: d.inverter.prezzoVendita ?? 0 });

  const battKwh = d.batteria ?? 0;
  if (d.batteriaModello && d.batteriaModello.potenzaW > 0 && battKwh > 0) {
    const kwhModulo = d.batteriaModello.potenzaW / 1000;
    const moduli = moduliPer(battKwh, kwhModulo);
    righe.push({
      testoLibero: `${SEGNO_STUDIO}Batteria ${d.batteriaModello.nome} — ${moduli} ${moduli === 1 ? "modulo" : "moduli"} (${fmt2(moduli * kwhModulo)} kWh)`,
      quantita: moduli,
      prezzoUnitario: d.batteriaModello.prezzoVendita > 0 ? d.batteriaModello.prezzoVendita : kwhModulo * (d.costoBatteria ?? 0),
    });
  } else if (battKwh > 0 && d.costoBatteria != null) {
    righe.push({ testoLibero: `${SEGNO_STUDIO}Sistema di accumulo ${battKwh} kWh`, quantita: 1, prezzoUnitario: battKwh * d.costoBatteria });
  }

  if (kwp > 0 && d.costoKwp != null) {
    righe.push({ testoLibero: `${SEGNO_STUDIO}Installazione, cavi e quadri — ${fmt2(kwp)} kWp`, quantita: 1, prezzoUnitario: kwp * d.costoKwp });
  }
  const n = (k: string) => { const v = d.stato?.[k]; return typeof v === "number" && v > 0 ? v : 0; };
  if (n("sottostruttura")) righe.push({ testoLibero: `${SEGNO_STUDIO}Sottostruttura e staffe`, quantita: 1, prezzoUnitario: n("sottostruttura") });
  if (n("pratiche")) righe.push({ testoLibero: `${SEGNO_STUDIO}Pratiche, allaccio e collaudo`, quantita: 1, prezzoUnitario: n("pratiche") });
  if (n("piattaforma")) righe.push({ testoLibero: `${SEGNO_STUDIO}Piattaforma per la posa`, quantita: 1, prezzoUnitario: n("piattaforma") });
  return righe;
}

/** Tipo di una riga dello Studio («Pannello», «Inverter», «Batteria», …): la prima parola dopo il sole. */
export const tipoRiga = (testo: string | null) => (testo ?? "").slice(SEGNO_STUDIO.length).split(" ")[0];

/** Riga portata dallo Studio in passato (da sostituire al nuovo invio). */
export const eRigaStudio = (r: { testoLibero: string | null; prodottoId: string | null }) =>
  !r.prodottoId && !!r.testoLibero && r.testoLibero.startsWith(SEGNO_STUDIO);

/** La copertina si cambia solo se è vuota o è già una foto dello Studio: un render scelto a mano resta. */
export const copertinaSostituibile = (url: string | null | undefined) => !url || url.startsWith("/api/solaris/foto/");

type Esito = { ok: true; preventivoId: string; righe: number; foto: boolean } | { ok: false; errore: string; preventivoId?: string };

export async function portaSolarisInOfferta(
  progettoId: string,
  utente: Utente,
  opz: { pannello?: ComponenteStudio | null; inverter?: ComponenteStudio | null; fotoDataUri?: string | null } = {},
): Promise<Esito> {
  const progetto = await prisma.solarisProgetto.findUnique({
    where: { id: progettoId },
    select: {
      id: true, preventivoId: true, commercialeId: true, kwp: true, numeroPannelli: true, batteria: true,
      panelId: true, inverterId: true, costoKwp: true, costoBatteria: true, statoJson: true,
      preventivo: { select: { confermatoIl: true, commercialeId: true, immagineCopertinaUrl: true } },
    },
  });
  if (!progetto || !progetto.preventivoId || !progetto.preventivo) return { ok: false, errore: "Progetto non collegato a un'offerta" };
  const preventivoId = progetto.preventivoId;
  const puo = isAmministratore(utente) || getSolarisLivello(utente) === "TECNICO" ||
    progetto.commercialeId === utente.id || progetto.preventivo.commercialeId === utente.id;
  if (!puo) return { ok: false, errore: "Non autorizzato", preventivoId };
  if (progetto.preventivo.confermatoIl) return { ok: false, errore: "L'offerta è già confermata: righe e foto non si cambiano più", preventivoId };

  const stato = (progetto.statoJson ?? null) as Record<string, unknown> | null;
  const battId = typeof stato?.battId === "string" && stato.battId ? stato.battId : null;
  const [pannelloDb, inverterDb, battDb] = await Promise.all([
    progetto.panelId ? prisma.solarisComponente.findUnique({ where: { id: progetto.panelId }, select: { nome: true, potenzaW: true, prezzoVendita: true } }) : null,
    progetto.inverterId ? prisma.solarisComponente.findUnique({ where: { id: progetto.inverterId }, select: { nome: true, prezzoVendita: true } }) : null,
    battId ? prisma.solarisComponente.findUnique({ where: { id: battId }, select: { nome: true, potenzaW: true, prezzoVendita: true } }) : null,
  ]);
  // pannelli e inverter di serie dello Studio (non nel catalogo del CRM): nome e prezzo come li mostra lo Studio
  const pannello = pannelloDb ?? (opz.pannello?.nome ? { nome: opz.pannello.nome, potenzaW: opz.pannello.potenzaW ?? 0, prezzoVendita: opz.pannello.prezzo ?? 0 } : null);
  const inverter = inverterDb ?? (opz.inverter?.nome ? { nome: opz.inverter.nome, prezzoVendita: opz.inverter.prezzo ?? 0 } : null);

  const righe = righeDaProgetto({
    kwp: progetto.kwp, numeroPannelli: progetto.numeroPannelli, batteria: progetto.batteria,
    costoKwp: progetto.costoKwp, costoBatteria: progetto.costoBatteria, stato, pannello, inverter, batteriaModello: battDb,
  });

  const vecchie = await prisma.rigaPreventivo.findMany({ where: { preventivoId }, select: { id: true, testoLibero: true, prodottoId: true, ordine: true, sezioneId: true, allegaScheda: true } });
  const daTogliere = vecchie.filter(eRigaStudio);
  const sezioneId = daTogliere[0]?.sezioneId ?? null;
  const restanti = vecchie.filter((r) => !eRigaStudio(r) && r.sezioneId === sezioneId);
  // le righe nuove prendono il posto delle vecchie (o vanno in coda)
  const ordineBase = daTogliere.length ? Math.min(...daTogliere.map((r) => r.ordine)) : restanti.reduce((m, r) => Math.max(m, r.ordine + 1), 0);

  const spuntate = new Set(daTogliere.filter((r) => r.allegaScheda).map((r) => tipoRiga(r.testoLibero)));
  let foto = false;
  await prisma.$transaction(async (tx) => {
    if (daTogliere.length) {
      const ids = daTogliere.map((r) => r.id);
      await tx.rigaOptional.deleteMany({ where: { rigaId: { in: ids } } });
      await tx.rigaPreventivo.deleteMany({ where: { id: { in: ids } } });
    }
    if (righe.length) {
      await tx.rigaPreventivo.createMany({
        // la spunta «allega la scheda» messa prima resta sulla riga dello stesso tipo (pannello, inverter, batteria)
        data: righe.map((r, i) => ({ ...r, preventivoId, sezioneId, ordine: ordineBase + i, allegaScheda: spuntate.has(tipoRiga(r.testoLibero)) })),
      });
    }
    const dataUri = opz.fotoDataUri;
    if (dataUri && /^data:image\/(jpeg|png|webp);base64,/.test(dataUri) && copertinaSostituibile(progetto.preventivo!.immagineCopertinaUrl)) {
      await tx.solarisFoto.deleteMany({ where: { progettoId, tipo: "OFFERTA" } });
      const f = await tx.solarisFoto.create({ data: { progettoId, dataUri, nome: "Tetto con i pannelli", tipo: "OFFERTA" }, select: { id: true } });
      await tx.preventivo.update({ where: { id: preventivoId }, data: { immagineCopertinaUrl: urlFotoOfferta(f.id) } });
      foto = true;
    }
  });
  await ricalcolaTotali(preventivoId);
  return { ok: true, preventivoId, righe: righe.length, foto };
}
