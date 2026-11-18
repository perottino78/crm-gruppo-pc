import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { brandIdDaNome, telefonistaDefaultPerBrand } from "@/lib/leadIngest";
import { provenienzaDaFonte } from "@/lib/clienti/provenienza";
import { chiusuraGiornata, giorniFa } from "@/lib/automazioni/tempi";
import { classifica, normalizzaEmail, normalizzaTel, riepilogo, type Esistente, type Esito, type Modo, type RigaLead } from "./importa";

/** Tutto quello che c'è già in ONE (lead e clienti) con telefoni ed email normalizzati, per cercare i doppioni. Legge solo i campi che servono. */
export async function esistentiPerDoppioni(modo: Modo = "TELEFONISTE"): Promise<Esistente[]> {
  const soloEmail = modo === "CAMPAGNE";
  const [lead, clienti] = await Promise.all([
    prisma.lead.findMany({ select: { id: true, nome: true, telefono: !soloEmail, email: true, createdAt: true } }),
    prisma.cliente.findMany({ select: { id: true, nome: true, telefono: !soloEmail, cellulare: !soloEmail, altroTelefono: !soloEmail, email: true, altraEmail: true } }),
  ]);
  const t = (...v: (string | null | undefined)[]) => v.flatMap((x) => (x ? x.split(/[\/;,|]/) : [])).map((x) => normalizzaTel(x)).filter((x): x is string => !!x);
  const m = (...v: (string | null | undefined)[]) => v.map((x) => normalizzaEmail(x)).filter(Boolean);
  const adesso = new Date();
  return [
    ...lead.map((l): Esistente => ({ tipo: "LEAD", id: l.id, nome: l.nome, telefoni: soloEmail ? [] : t((l as { telefono?: string | null }).telefono), emails: m(l.email), info: `arrivato ${giorniFa(l.createdAt, adesso).toLowerCase()}` })),
    ...clienti.map((c): Esistente => {
      const x = c as { telefono?: string | null; cellulare?: string | null; altroTelefono?: string | null };
      return { tipo: "CLIENTE", id: c.id, nome: c.nome, telefoni: soloEmail ? [] : t(x.telefono, x.cellulare, x.altroTelefono), emails: m(c.email, c.altraEmail) };
    }),
  ];
}

export type EsitoRiga = { riga: number; stato: Esito["stato"]; motivo?: string; nome: string; telefono: string; email: string };
export type RisultatoImporta = { ok: boolean; errore?: string; riepilogo?: ReturnType<typeof riepilogo>; esiti?: EsitoRiga[]; avvisi?: string[]; creati?: number };

/**
 * Controlla un gruppo di righe (esegui=false) oppure salva solo le nuove (esegui=true). I doppioni si ricontrollano sempre sui dati di adesso,
 * quindi si può mandare il file a pezzi e ripetere senza creare doppioni.
 *  - TELEFONISTE: lead da chiamare (fase NUOVO, task di oggi della telefonista del marchio), senza email automatiche.
 *  - CAMPAGNE: contatti solo per le campagne email (anagrafica «Lead», provenienza), nessun task alle telefoniste.
 */
export async function importaRighe(righe: RigaLead[], modo: Modo, esegui: boolean, nomeFile: string, utente: { id: string; nome: string }): Promise<RisultatoImporta> {
  const esiti = classifica(righe, await esistentiPerDoppioni(modo), modo);
  const avvisi: string[] = [];
  const noti = new Map<string, string | null>();
  const marchioDi = async (m: string) => {
    if (!noti.has(m)) {
      const id = m ? await brandIdDaNome(m) : null;
      const b = id ? await prisma.brand.findUnique({ where: { id }, select: { nome: true } }) : null;
      const pulito = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
      const riconosciuto = !!m && !!b && pulito(m).includes(pulito(b.nome));
      noti.set(m, riconosciuto ? id : null);
      if (m && !riconosciuto) avvisi.push(`Marchio «${m}» non riconosciuto: quei contatti vanno su P&C.`);
    }
    return noti.get(m) ?? (await brandIdDaNome(null));
  };
  let creati = 0;
  if (esegui) {
    const adesso = new Date();
    const nuove = esiti.filter((x) => x.stato === "NUOVO").map((x) => x.riga);
    const quando = adesso.toISOString().slice(0, 10);
    if (modo === "CAMPAGNE") {
      const dati = [];
      for (const r of nuove) {
        const brandId = await marchioDi(r.marchio);
        if (!brandId) continue;
        dati.push({
          nome: r.nome.slice(0, 200), email: normalizzaEmail(r.email).slice(0, 200), telefono: r.telefono.slice(0, 40) || null,
          brandId, responsabileId: utente.id, categoria: "Lead", origine: provenienzaDaFonte(r.provenienza || "importazione"),
          comune: r.comune.slice(0, 120) || null, cap: r.cap.slice(0, 20) || null,
          descrizione: [r.prodotto && `Interesse: ${r.prodotto}`, r.note].filter(Boolean).join("\n").slice(0, 2000) || null,
          tag: `import ${quando}`,
        });
      }
      for (let i = 0; i < dati.length; i += 500) creati += (await prisma.cliente.createMany({ data: dati.slice(i, i + 500) })).count;
    } else {
      const telefonisti = new Map<string, string | null>();
      const leads = [], eventi = [];
      for (const r of nuove) {
        const brandId = await marchioDi(r.marchio);
        if (!brandId) continue;
        if (!telefonisti.has(brandId)) telefonisti.set(brandId, await telefonistaDefaultPerBrand(brandId));
        const id = randomUUID();
        leads.push({
          id, nome: r.nome.slice(0, 200), telefono: r.telefono.slice(0, 40) || null, email: normalizzaEmail(r.email).slice(0, 200) || null,
          brandId, telefonistaId: telefonisti.get(brandId) ?? null, fonte: provenienzaDaFonte(r.provenienza || "importazione"),
          note: r.note.slice(0, 2000) || null, comune: r.comune.slice(0, 120) || null, cap: r.cap.slice(0, 20) || null, prodotto: r.prodotto.slice(0, 120) || null,
          fase: "NUOVO", scadenzaAzione: chiusuraGiornata(adesso),
        });
        // niente email automatiche: i lead importati sono già in lista e li lavora la telefonista
        eventi.push({ leadId: id, tipo: "lead.creato", testo: `Importato dal file «${nomeFile}» (riga ${r.riga}): da classificare in target o fuori regione.`, utenteNome: utente.nome });
      }
      for (let i = 0; i < leads.length; i += 500) {
        creati += (await prisma.lead.createMany({ data: leads.slice(i, i + 500) })).count;
        await prisma.leadEvento.createMany({ data: eventi.slice(i, i + 500) });
      }
    }
  }
  return {
    ok: true, creati: esegui ? creati : undefined, avvisi: [...new Set(avvisi)], riepilogo: riepilogo(esiti),
    esiti: esiti.filter((e) => e.stato !== "NUOVO").map((e) => ({ riga: e.riga.riga, stato: e.stato, motivo: e.motivo, nome: e.riga.nome, telefono: e.riga.telefono, email: e.riga.email })),
  };
}
