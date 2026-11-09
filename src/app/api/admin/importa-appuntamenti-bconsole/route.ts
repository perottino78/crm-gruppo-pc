import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { convertiEventoBC, chiaveNome, type EventoBC } from "@/lib/calendario/bconsole";
import { indiceClienti } from "@/lib/clienti/bconsole";
import { provenienzaDaFonte } from "@/lib/clienti/provenienza";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Porta nel calendario del CRM gli appuntamenti del calendario di BConsole (letto in sola lettura).
// Corpo: { eventi: EventoBC[], staff: string[] } (staff = nomi delle persone dell'azienda in BConsole, per scartare gli impegni interni).
// Non duplica (Appuntamento.chiaveImport = «BC|<n. attività>»): ai rilanci quelli già portati non si toccano, salvo ?aggiorna=1
// (data, durata, stato, incaricato e titolo da BConsole). Cliente: quello del CRM per telefono o nome, altrimenti creato.
// Non manda inviti né email. ?prova=1 conta soltanto, senza scrivere.
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prova = req.nextUrl.searchParams.get("prova") === "1";
  const aggiorna = req.nextUrl.searchParams.get("aggiorna") === "1";
  let corpo: { eventi: EventoBC[]; staff?: string[] };
  try {
    corpo = JSON.parse(await req.text());
    if (!Array.isArray(corpo.eventi)) throw new Error("serve { eventi: [...] }");
  } catch (e) {
    return NextResponse.json({ error: `JSON non valido: ${(e as Error).message}` }, { status: 400 });
  }

  const [brand, utenti, esistenti, giaPortati] = await Promise.all([
    prisma.brand.findMany({ select: { id: true, nome: true } }),
    prisma.utente.findMany({ select: { id: true, nome: true, ruolo: true, stato: true }, orderBy: { nome: "asc" } }),
    prisma.cliente.findMany({ select: { id: true, nome: true, telefono: true, cellulare: true, email: true, piva: true, codiceFiscale: true, bconsoleId: true } }),
    prisma.appuntamento.findMany({ where: { chiaveImport: { startsWith: "BC|" } }, select: { id: true, chiaveImport: true } }),
  ]);
  const pc = brand.find((b) => b.nome === "P&C") ?? brand[0];
  if (!pc) return NextResponse.json({ error: "nessun marchio nel CRM" }, { status: 500 });
  const staff = [...(corpo.staff ?? []), ...utenti.map((u) => u.nome)];
  const perNome = new Map(utenti.map((u) => [chiaveNome(u.nome), u]));
  // il centralino «Info P&C» di BConsole è la telefonista (la prima attiva in ordine alfabetico)
  const centralino = utenti.find((u) => u.ruolo === "TELEFONISTA" && u.stato === "ATTIVO") ?? utenti.find((u) => u.ruolo === "TELEFONISTA");
  const utenteDi = (nome: string) => (/^info /i.test(nome) ? centralino : perNome.get(chiaveNome(nome)));
  const portati = new Map(giaPortati.map((a) => [a.chiaveImport!, a.id]));
  const indice = indiceClienti(esistenti);
  const esistentiId = new Set(esistenti.map((c) => c.id));

  const conta = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };
  const esito = {
    prova, ricevuti: corpo.eventi.length, creati: 0, aggiornati: 0, giaPresenti: 0, interni: 0, senzaIncaricato: 0, clientiTrovati: 0, clientiCreati: 0,
    perIncaricato: {} as Record<string, number>, perStato: {} as Record<string, number>, perMese: {} as Record<string, number>, incaricatiNonTrovati: {} as Record<string, number>,
    esempiClientiCreati: [] as string[],
  };
  const visti = new Set<string>();
  for (const e of corpo.eventi) {
    const a = convertiEventoBC(e, staff);
    if (!a) { esito.interni++; continue; }
    if (visti.has(a.chiave)) continue;
    visti.add(a.chiave);
    const giaId = portati.get(a.chiave);
    if (giaId && !aggiorna) { esito.giaPresenti++; continue; }
    const utente = a.incaricati.map(utenteDi).find(Boolean);
    if (!utente) { esito.senzaIncaricato++; for (const n of a.incaricati) conta(esito.incaricatiNonTrovati, n); continue; }
    const dati = {
      utenteId: utente.id, tipo: a.tipo, dataOra: a.inizio, durataMin: a.durataMin, titolo: a.titolo, stato: a.stato,
      luogo: a.luogo, creatoDaNome: a.creatoDa ? `${a.creatoDa} (BConsole)` : "BConsole",
    };
    conta(esito.perIncaricato, utente.nome); conta(esito.perStato, a.stato);
    conta(esito.perMese, a.inizio.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", month: "2-digit", year: "numeric" }));
    if (giaId) {
      if (!prova) await prisma.appuntamento.update({ where: { id: giaId }, data: dati });
      esito.aggiornati++;
      continue;
    }
    // cliente: quello del CRM (telefono o nome e cognome), altrimenti nuovo
    const trovato = indice.trova({ nome: a.account, telefono: a.telefono } as Parameters<typeof indice.trova>[0]);
    let clienteId: string | null = trovato?.id ?? null;
    if (trovato && esistentiId.has(trovato.id)) esito.clientiTrovati++;
    else if (!trovato) {
      esito.clientiCreati++;
      if (esito.esempiClientiCreati.length < 15) esito.esempiClientiCreati.push(a.account);
      if (!prova) {
        const c = await prisma.cliente.create({ data: { nome: a.account, telefono: a.telefono, brandId: pc.id, responsabileId: utente.ruolo === "COMMERCIALE" ? utente.id : null, origine: provenienzaDaFonte(a.provenienza), noteLibere: "Creato dall'importazione degli appuntamenti di BConsole." } });
        clienteId = c.id;
      } else clienteId = `nuovo-${esito.clientiCreati}`;
      indice.aggiungi({ id: clienteId, nome: a.account, telefono: a.telefono, cellulare: null, email: null, piva: null, codiceFiscale: null, bconsoleId: null });
    }
    if (!prova && clienteId) await prisma.appuntamento.create({ data: { ...dati, clienteId, note: a.note, chiaveImport: a.chiave, invitaCliente: false } });
    esito.creati++;
  }
  return NextResponse.json(esito);
}
