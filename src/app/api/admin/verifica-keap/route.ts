import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizzaTelefono, chiaveNomeCliente } from "@/lib/clienti/bconsole";
import { PERCORSI, FASI_LEAD } from "@/lib/automazioni/percorsi";
import { statoAutomazioni, CHIAVE_ATTIVE } from "@/lib/automazioni/motore";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const roma = (d: Date | null | undefined) => (d ? d.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }) : null);
const nomePasso = (percorso: string, passo: number) => PERCORSI[percorso]?.[passo]?.nome ?? `${percorso}#${passo}`;

/**
 * Passaggio da Keap a P&C ONE — controllo IN SOLA LETTURA (non scrive nulla, non invia nulla).
 * GET: stato della coda delle email automatiche (cosa partirebbe accendendo gli invii).
 * POST { contatti: [{ id, nome, email, telefoni }] }: per ogni contatto Keap i lead e i clienti di P&C ONE abbinati
 * (email, telefono o nome e cognome in qualsiasi ordine) con fase, task, appuntamenti, email e invii programmati.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ora = new Date();
  const [stato, config, invii, email, campagne] = await Promise.all([
    statoAutomazioni(),
    prisma.configurazione.findUnique({ where: { chiave: CHIAVE_ATTIVE } }),
    prisma.invioProgrammato.findMany({ where: { stato: { in: ["IN_ATTESA", "IN_CORSO", "DA_VERIFICARE", "FALLITO"] } }, select: { stato: true, percorso: true, passo: true, eseguiDopo: true, lead: { select: { nome: true, fase: true } } } }),
    prisma.emailLead.groupBy({ by: ["stato", "categoria"], _count: { _all: true } }),
    prisma.campagna.findMany({ where: { stato: "IN_INVIO" }, select: { nome: true, stato: true } }).catch(() => []),
  ]);
  const h = (ms: number) => new Date(ora.getTime() + ms);
  const fascia = (d: Date) => d < h(-24 * 3600_000) ? "scaduto oltre 24h (→ DA_VERIFICARE, non parte)" : d <= ora ? "scaduto da meno di 24h (PARTIREBBE subito)" : d <= h(24 * 3600_000) ? "entro 24h" : d <= h(72 * 3600_000) ? "entro 72h" : "oltre 72h";
  const perPasso: Record<string, Record<string, number>> = {};
  for (const i of invii) {
    const k = `${i.stato} · ${nomePasso(i.percorso, i.passo)}`;
    const f = i.stato === "IN_ATTESA" ? fascia(i.eseguiDopo) : "-";
    perPasso[k] = perPasso[k] ?? {}; perPasso[k][f] = (perPasso[k][f] ?? 0) + 1;
  }
  const partirebbero = invii.filter((i) => i.stato === "IN_ATTESA" && i.eseguiDopo <= ora && i.eseguiDopo >= h(-24 * 3600_000))
    .map((i) => ({ lead: i.lead.nome, fase: i.lead.fase, passo: nomePasso(i.percorso, i.passo), previsto: roma(i.eseguiDopo) }));
  const prossimi = invii.filter((i) => i.stato === "IN_ATTESA" && i.eseguiDopo > ora && i.eseguiDopo <= h(72 * 3600_000))
    .sort((a, b) => a.eseguiDopo.getTime() - b.eseguiDopo.getTime())
    .map((i) => ({ lead: i.lead.nome, fase: i.lead.fase, passo: nomePasso(i.percorso, i.passo), previsto: roma(i.eseguiDopo) }));
  return NextResponse.json({ ora: roma(ora), automazioni: { attive: stato.attive, posta: stato.posta, valoreChiave: config?.valore ?? null }, codaPerPasso: perPasso, partirebbero, prossimi72h: prossimi, emailLead: email, campagneAttive: campagne });
}

type ContattoKeap = { id: string; nome: string; email?: string | null; telefoni?: string[] };

export async function POST(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { contatti } = (await req.json()) as { contatti: ContattoKeap[] };
  const [leads, clienti] = await Promise.all([
    prisma.lead.findMany({ select: { id: true, nome: true, email: true, telefono: true } }),
    prisma.cliente.findMany({ select: { id: true, nome: true, email: true, telefono: true, cellulare: true } }),
  ]);
  const indice = <T extends { id: string; nome: string; email: string | null }>(xs: T[], tel: (x: T) => (string | null)[]) => {
    const m = new Map<string, Set<string>>();
    const metti = (k: string, id: string) => { if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(id); };
    for (const x of xs) {
      if (x.email?.trim()) metti(`E:${x.email.trim().toLowerCase()}`, x.id);
      for (const t of tel(x)) { const n = normalizzaTelefono(t); if (n) metti(`T:${n}`, x.id); }
      const k = chiaveNomeCliente(x.nome); if (k.includes(" ")) metti(`N:${k}`, x.id);
    }
    return m;
  };
  const iL = indice(leads, (l) => [l.telefono]);
  const iC = indice(clienti, (c) => [c.telefono, c.cellulare]);
  const trova = (m: Map<string, Set<string>>, c: ContattoKeap) => {
    const per = new Map<string, string[]>();
    const prova = (k: string, motivo: string) => { for (const id of m.get(k) ?? []) per.set(id, [...(per.get(id) ?? []), motivo]); };
    if (c.email?.trim()) prova(`E:${c.email.trim().toLowerCase()}`, "email");
    for (const t of c.telefoni ?? []) { const n = normalizzaTelefono(t); if (n) prova(`T:${n}`, "telefono"); }
    const k = chiaveNomeCliente(c.nome); if (k.includes(" ")) prova(`N:${k}`, "nome");
    return per;
  };
  const out = [];
  for (const c of contatti) {
    const mL = trova(iL, c), mC = trova(iC, c);
    const lead = mL.size ? await prisma.lead.findMany({
      where: { id: { in: [...mL.keys()] } },
      select: {
        id: true, nome: true, email: true, telefono: true, fase: true, createdAt: true, scadenzaAzione: true, richiamoIl: true, appuntamentoIl: true, nonGestitoIl: true, disiscritto: true,
        telefonista: { select: { nome: true } }, clienteGenerato: { select: { id: true } },
        eventi: { orderBy: { createdAt: "desc" }, take: 8, select: { tipo: true, testo: true, createdAt: true, utenteNome: true } },
        invii: { where: { OR: [{ stato: { not: "ANNULLATO" } }, { createdAt: { gte: new Date(Date.now() - 15 * 86400_000) } }] }, orderBy: { eseguiDopo: "asc" }, select: { percorso: true, passo: true, stato: true, eseguiDopo: true, errore: true } },
        emailLead: { orderBy: { createdAt: "desc" }, take: 8, select: { chiave: true, categoria: true, stato: true, createdAt: true, motivo: true } },
      },
    }) : [];
    const ids = [...new Set([...mC.keys(), ...lead.map((l) => l.clienteGenerato?.id).filter(Boolean) as string[]])];
    const cli = ids.length ? await prisma.cliente.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true, appuntamenti: { where: { dataOra: { gte: new Date("2026-09-01") } }, orderBy: { dataOra: "asc" }, select: { dataOra: true, tipo: true, stato: true, titolo: true, chiaveImport: true, utente: { select: { nome: true } } } } },
    }) : [];
    out.push({
      keap: c,
      lead: lead.map((l) => ({
        id: l.id, perché: mL.get(l.id), nome: l.nome, email: l.email, telefono: l.telefono, faseNome: FASI_LEAD[l.fase]?.nome ?? l.fase, fase: l.fase,
        arrivato: roma(l.createdAt), prossimaAttivita: roma(l.scadenzaAzione), richiamo: roma(l.richiamoIl), appuntamento: roma(l.appuntamentoIl),
        nonGestito: roma(l.nonGestitoIl), disiscritto: l.disiscritto, telefonista: l.telefonista?.nome ?? null,
        eventi: l.eventi.map((e) => `${roma(e.createdAt)} ${e.tipo} ${e.utenteNome ?? ""}: ${e.testo}`.slice(0, 220)),
        invii: l.invii.map((i) => `${i.stato} ${roma(i.eseguiDopo)} ${nomePasso(i.percorso, i.passo)}${i.errore ? ` (${i.errore})` : ""}`),
        emailInviate: l.emailLead.map((e) => `${roma(e.createdAt)} ${e.chiave} ${e.categoria} ${e.stato}${e.motivo ? ` (${e.motivo})` : ""}`),
      })),
      clienti: cli.map((x) => ({
        id: x.id, perché: mC.get(x.id) ?? ["lead"], nome: x.nome,
        appuntamenti: x.appuntamenti.map((a) => `${roma(a.dataOra)} ${a.tipo} ${a.stato} ${a.utente.nome} ${a.chiaveImport ? "BConsole" : "ONE"} ${a.titolo ?? ""}`.slice(0, 200)),
      })),
    });
  }
  return NextResponse.json({ contatti: out });
}
