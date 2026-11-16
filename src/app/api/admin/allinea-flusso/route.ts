import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FASI_DEFAULT } from "@/lib/flusso";

export const dynamic = "force-dynamic";

const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const ok = (req: NextRequest) => req.headers.get("x-seed-key") === SECRET;

/**
 * Allinea il flusso dei task fra uffici salvato nel database al flusso reale di P&C (16/11/2026): uffici, catena e testi dei task.
 * Delle fasi già presenti cambia solo ufficio, fase successiva, nome e testo del task; le impostazioni delle mail non si toccano.
 * GET = prova (elenco di cosa cambierebbe), POST = esegue (rilanciabile).
 */
async function esegui(prova: boolean) {
  const esistenti = await prisma.flussoFase.findMany();
  const per = new Map(esistenti.map((f) => [f.chiave, f]));
  const cambi: { chiave: string; azione: string; dettaglio?: string }[] = [];
  for (const [i, d] of FASI_DEFAULT.entries()) {
    const e = per.get(d.chiave);
    if (!e) {
      cambi.push({ chiave: d.chiave, azione: "crea", dettaglio: `${d.ufficio} → ${d.prossimaChiave ?? "fine"}` });
      if (!prova) await prisma.flussoFase.create({ data: { chiave: d.chiave, ordine: i + 1, nome: d.nome, ufficio: d.ufficio, prossimaChiave: d.prossimaChiave, taskAttivo: true, taskTitolo: d.taskTitolo, taskTesto: d.taskTesto, mailAttiva: d.mailAttiva ?? false, mailQuando: d.mailQuando ?? "FATTO", mailDestinatario: d.mailDestinatario ?? "CLIENTE", mailOggetto: d.mailOggetto ?? null, mailTesto: d.mailTesto ?? null } });
      continue;
    }
    const diversi: string[] = [];
    if (e.ufficio !== d.ufficio) diversi.push(`ufficio ${e.ufficio} → ${d.ufficio}`);
    if ((e.prossimaChiave ?? null) !== d.prossimaChiave) diversi.push(`dopo ${e.prossimaChiave ?? "fine"} → ${d.prossimaChiave ?? "fine"}`);
    if (e.taskTitolo !== d.taskTitolo || (e.taskTesto ?? "") !== d.taskTesto || e.nome !== d.nome) diversi.push("testo del task");
    if (e.ordine !== i + 1) diversi.push("ordine");
    if (!diversi.length) continue;
    cambi.push({ chiave: d.chiave, azione: "aggiorna", dettaglio: diversi.join("; ") });
    if (!prova) await prisma.flussoFase.update({ where: { chiave: d.chiave }, data: { ordine: i + 1, nome: d.nome, ufficio: d.ufficio, prossimaChiave: d.prossimaChiave, taskTitolo: d.taskTitolo, taskTesto: d.taskTesto, taskAttivo: true } });
  }
  return { ok: true, prova, cambi };
}

export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await esegui(true));
}

export async function POST(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await esegui(false));
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
