import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aggiornaModulo } from "@/lib/meta/moduli";
import { catalogo, cfgConModuli, chiediAlGateway, importaLeadDaGraph, moduliCollegati, salvaModuli } from "@/lib/meta/moduli-server";
import { statoAutomazioni, eseguiDopoRisposta } from "@/lib/automazioni/motore";
import type { GraphLead } from "@/lib/meta/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const ok = (req: NextRequest) => (req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key")) === SECRET;

/** Lead di Meta di un modulo negli ultimi N giorni e quanti sono già in P&C ONE (stesso ID Meta, telefono o email). Solo conteggi. */
async function conta(formId: string, giorni: number) {
  const r = await chiediAlGateway<{ leads?: GraphLead[] }>({ azione: "lead", form_id: formId, giorni }, 55_000);
  if (!r.ok) return { formId, errore: r.errore };
  const leads = r.dati.leads ?? [];
  const ids = leads.map((l) => l.id);
  const gia = await prisma.lead.count({ where: { metaLeadgenId: { in: ids } } });
  const campo = (l: GraphLead, nomi: string[]) => l.field_data.find((f) => nomi.includes(f.name.toLowerCase()))?.values[0]?.trim() || null;
  const tel = leads.map((l) => campo(l, ["phone_number", "phone", "telefono"])).filter((x): x is string => !!x);
  const mail = leads.map((l) => campo(l, ["email"])?.toLowerCase()).filter((x): x is string => !!x);
  const stessoContatto = await prisma.lead.count({ where: { metaLeadgenId: { notIn: ids }, OR: [{ telefono: { in: tel } }, { email: { in: mail } }] } });
  const date = leads.map((l) => l.created_time).filter(Boolean).sort();
  return { formId, inMeta: leads.length, giaConIdMeta: gia, stessoContattoGiaPresente: stessoContatto, primo: date[0] ?? null, ultimo: date.at(-1) ?? null };
}

// Solo uso tecnico (x-seed-key): stato pagine, conteggi per modulo, collegamento e recupero. Mai dati personali in risposta.
export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const giorni = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("giorni")) || 30));
  const moduli = (req.nextUrl.searchParams.get("moduli") ?? "").split(",").filter((x) => /^\d+$/.test(x));
  const pagine = await chiediAlGateway<{ pagine?: unknown }>({ azione: "pagine" });
  const conteggi = [];
  for (const m of moduli) conteggi.push(await conta(m, giorni));
  return NextResponse.json({ automazioni: await statoAutomazioni(), pagine: pagine.ok ? pagine.dati.pagine : pagine.errore, conteggi, collegati: await moduliCollegati() });
}

export async function POST(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { collega?: { formId: string; nome?: string; brand?: string; pageId?: string }[]; recupera?: { giorni?: number; moduli?: string[] } };
  let lista = await moduliCollegati();
  const nomi = new Map((await catalogo())?.pagine.flatMap((p) => p.moduli.map((m) => [m.id, { nome: m.nome, pageId: p.id }] as const)) ?? []);
  for (const c of b.collega ?? []) {
    if (!/^\d+$/.test(c.formId)) continue;
    if (c.brand && !(await prisma.brand.findFirst({ where: { nome: c.brand } }))) return NextResponse.json({ error: `marchio ${c.brand}` }, { status: 400 });
    lista = aggiornaModulo(lista, { formId: c.formId, nome: c.nome ?? nomi.get(c.formId)?.nome ?? `Modulo ${c.formId}`, pageId: c.pageId ?? nomi.get(c.formId)?.pageId ?? null, brand: c.brand ?? null, attivo: true, da: "Configurazione tecnica", il: new Date().toISOString() });
  }
  await salvaModuli(lista);
  const recuperi = [];
  if (b.recupera?.moduli?.length) {
    const cfg = await cfgConModuli();
    const giorni = Math.min(90, Math.max(1, Number(b.recupera.giorni) || 7));
    for (const formId of b.recupera.moduli) {
      if (!cfg.allowedFormIds.includes(formId)) { recuperi.push({ formId, errore: "non collegato" }); continue; }
      const r = await chiediAlGateway<{ leads?: GraphLead[] }>({ azione: "lead", form_id: formId, giorni }, 55_000);
      if (!r.ok) { recuperi.push({ formId, errore: r.errore }); continue; }
      const pageId = nomi.get(formId)?.pageId;
      const brand = cfg.formBrands[formId] ?? (pageId ? cfg.pageBrands[pageId] : undefined) ?? cfg.defaultBrand;
      recuperi.push({ formId, brand, inMeta: (r.dati.leads ?? []).length, ...(await importaLeadDaGraph(r.dati.leads ?? [], formId, brand)) });
    }
    eseguiDopoRisposta();
  }
  return NextResponse.json({ collegati: lista.filter((m) => m.attivo).map((m) => `${m.formId} ${m.brand ?? ""} ${m.nome}`), recuperi });
}
