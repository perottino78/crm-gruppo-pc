import { prisma } from "@/lib/prisma";
import { brandIdDaNome, telefonistaDefaultPerBrand } from "@/lib/leadIngest";
import { provenienzaDaFonte } from "@/lib/clienti/provenienza";
import { chiusuraGiornata, giorniFa } from "@/lib/automazioni/tempi";
import { classifica, normalizzaEmail, normalizzaTel, righeDaCsv, riepilogo, type Esistente, type Esito, type RigaLead } from "./importa";

/** Tutto quello che c'è già in ONE (lead e clienti) con telefoni ed email normalizzati, per cercare i doppioni. Legge solo i campi che servono. */
export async function esistentiPerDoppioni(): Promise<Esistente[]> {
  const [lead, clienti] = await Promise.all([
    prisma.lead.findMany({ select: { id: true, nome: true, telefono: true, email: true, createdAt: true, fase: true } }),
    prisma.cliente.findMany({ select: { id: true, nome: true, telefono: true, cellulare: true, altroTelefono: true, email: true, altraEmail: true } }),
  ]);
  const t = (...v: (string | null)[]) => v.flatMap((x) => (x ? x.split(/[\/;,|]/) : [])).map((x) => normalizzaTel(x)).filter((x): x is string => !!x);
  const m = (...v: (string | null)[]) => v.map((x) => normalizzaEmail(x)).filter(Boolean);
  const adesso = new Date();
  return [
    ...lead.map((l): Esistente => ({ tipo: "LEAD", id: l.id, nome: l.nome, telefoni: t(l.telefono), emails: m(l.email), info: `arrivato ${giorniFa(l.createdAt, adesso).toLowerCase()}` })),
    ...clienti.map((c): Esistente => ({ tipo: "CLIENTE", id: c.id, nome: c.nome, telefoni: t(c.telefono, c.cellulare, c.altroTelefono), emails: m(c.email, c.altraEmail) })),
  ];
}

export type RisultatoImporta = {
  ok: boolean; errore?: string;
  colonneTrovate?: string[]; colonneNonCapite?: string[];
  riepilogo?: ReturnType<typeof riepilogo>;
  esiti?: { riga: number; stato: Esito["stato"]; motivo?: string; nome: string; telefono: string; email: string }[];
  avvisi?: string[];
  creati?: number;
};

/** Controlla il file (esegui=false) oppure salva solo le righe nuove (esegui=true). I doppioni si ricontrollano sempre sui dati di adesso. */
export async function importaLead(testo: string, nomeFile: string, esegui: boolean, utenteNome: string): Promise<RisultatoImporta> {
  const lettura = righeDaCsv(testo);
  if (lettura.errore) return { ok: false, errore: lettura.errore, colonneNonCapite: lettura.colonneNonCapite };
  const esiti = classifica(lettura.righe, await esistentiPerDoppioni());
  const avvisi: string[] = [];
  if (lettura.righe.length >= 5000) avvisi.push("Il file ha più di 5.000 righe: ho letto solo le prime 5.000. Carica il resto in un secondo file.");
  const marchiNoti = new Map<string, string | null>();
  const marchioDi = async (m: string) => {
    if (!marchiNoti.has(m)) {
      const id = m ? await brandIdDaNome(m) : null;
      const b = id ? await prisma.brand.findUnique({ where: { id }, select: { nome: true } }) : null;
      const riconosciuto = !!m && !!b && (b.nome.toLowerCase().replace(/[^a-z0-9]/g, "") === m.toLowerCase().replace(/[^a-z0-9]/g, "") || m.toLowerCase().replace(/[^a-z0-9]/g, "").includes(b.nome.toLowerCase().replace(/[^a-z0-9]/g, "")));
      marchiNoti.set(m, riconosciuto ? id : null);
      if (m && !riconosciuto) avvisi.push(`Marchio «${m}» non riconosciuto: quei lead vanno su P&C.`);
    }
    return marchiNoti.get(m) ?? (await brandIdDaNome(null));
  };
  let creati = 0;
  if (esegui) {
    const adesso = new Date();
    const telefonisti = new Map<string, string | null>();
    for (const e of esiti.filter((x) => x.stato === "NUOVO")) {
      const r: RigaLead = e.riga;
      const brandId = await marchioDi(r.marchio);
      if (!brandId) continue;
      if (!telefonisti.has(brandId)) telefonisti.set(brandId, await telefonistaDefaultPerBrand(brandId));
      await prisma.lead.create({
        data: {
          nome: r.nome.slice(0, 200), telefono: r.telefono.slice(0, 40) || null, email: normalizzaEmail(r.email).slice(0, 200) || null,
          brandId, telefonistaId: telefonisti.get(brandId) ?? null,
          fonte: provenienzaDaFonte(r.provenienza || "importazione"),
          note: r.note.slice(0, 2000) || null, comune: r.comune.slice(0, 120) || null, cap: r.cap.slice(0, 20) || null, prodotto: r.prodotto.slice(0, 120) || null,
          fase: "NUOVO", scadenzaAzione: chiusuraGiornata(adesso),
          // niente email automatiche: i lead importati sono già in lista e li lavora la telefonista
          eventi: { create: { tipo: "lead.creato", testo: `Importato dal file «${nomeFile}» (riga ${r.riga}): da classificare in target o fuori regione.`, utenteNome } },
        },
      });
      creati++;
    }
  }
  return {
    ok: true, creati: esegui ? creati : undefined, avvisi,
    colonneTrovate: lettura.colonneTrovate, colonneNonCapite: lettura.colonneNonCapite,
    riepilogo: riepilogo(esiti),
    esiti: esiti.filter((e) => e.stato !== "NUOVO").map((e) => ({ riga: e.riga.riga, stato: e.stato, motivo: e.motivo, nome: e.riga.nome, telefono: e.riga.telefono, email: e.riga.email })),
  };
}
