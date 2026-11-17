import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trovaCliente, type DocumentoBC } from "@/lib/amministrazione/bconsole";
import { nomiCompatibili } from "@/lib/clienti/bconsole";
import { registra } from "@/lib/amministrazione/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Ripara le fatture di vendita importate da BConsole e collegate al cliente sbagliato (stesso telefono o C.F. di un familiare,
// es. Matta Roberto / Scorda Antonella). Corpo = documenti di vendita come per l'importazione.
// Senza ?esegui=1 è una prova: elenca soltanto. Con ?esegui=1: toglie il C.F. messo per errore sulla scheda sbagliata e ricollega
// fattura e scadenze al cliente giusto (se esiste, altrimenti lo lascia senza cliente: va prima caricato dall'anagrafica).
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const esegui = req.nextUrl.searchParams.get("esegui") === "1";
  let elenco: DocumentoBC[];
  try { elenco = JSON.parse(await req.text()); if (!Array.isArray(elenco)) throw new Error("serve un array"); }
  catch (e) { return NextResponse.json({ error: `JSON non valido: ${(e as Error).message}` }, { status: 400 }); }
  const esiti: Record<string, unknown>[] = [];
  for (const d of elenco) {
    if (d.tipo !== "VENDITA") continue;
    const fv = await prisma.fatturaVendita.findFirst({ where: { chiave: `BCV|${d.bcId}` }, select: { id: true, numero: true, clienteId: true } });
    if (!fv?.clienteId) continue;
    const sbagliato = await prisma.cliente.findUnique({ where: { id: fv.clienteId }, select: { id: true, nome: true, codiceFiscale: true } });
    if (!sbagliato || nomiCompatibili(sbagliato.nome, d.controparte)) continue;
    const toglieCf = !!d.codiceFiscale && sbagliato.codiceFiscale?.toUpperCase() === d.codiceFiscale.toUpperCase();
    if (esegui && toglieCf) await prisma.cliente.update({ where: { id: sbagliato.id }, data: { codiceFiscale: null } });
    const giusto = esegui ? await trovaCliente(d) : null;
    const nuovo = giusto && giusto.id !== sbagliato.id ? giusto : null;
    if (esegui) {
      await prisma.fatturaVendita.update({ where: { id: fv.id }, data: { clienteId: nuovo?.id ?? null, clienteNome: nuovo?.nome ?? d.controparte } });
      await prisma.scadenza.updateMany({ where: { fatturaVenditaId: fv.id }, data: { clienteId: nuovo?.id ?? null, controparte: nuovo?.nome ?? d.controparte } });
      await registra("Ricollegata", fv.id, `Fattura ${fv.numero}`, `da «${sbagliato.nome}» a «${nuovo?.nome ?? d.controparte}»${nuovo ? "" : " (cliente da caricare)"}${toglieCf ? " · tolto il C.F. dalla scheda sbagliata" : ""}`, "Riparazione");
    }
    esiti.push({ numero: fv.numero, controparte: d.controparte, collegataA: sbagliato.nome, cfSullaSchedaSbagliata: toglieCf, nuovoCliente: nuovo?.nome ?? null });
  }
  return NextResponse.json({ prova: !esegui, daRiparare: esiti.length, esiti });
}
