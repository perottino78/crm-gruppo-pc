import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { daOraRoma } from "@/lib/calendario/tempo";
import { convertiAnagrafica, completaCliente, indiceClienti, marchio, usernameCommerciale, dataRoma, chiaveNomeCliente, COMMERCIALE_DI_RISERVA, NOMI_COMMERCIALI, type AnagraficaBConsole } from "@/lib/clienti/bconsole";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Importa lead e clienti letti da BConsole (array JSON nel corpo, a blocchi di qualche centinaio).
// Non duplica: riconosce il cliente per n. anagrafica BConsole, P.IVA, C.F., email, telefono o nome e cognome;
// su quelli già presenti completa solo i campi vuoti. Commerciale dalla sigla BConsole, se manca va a Ugo.
// ?prova=1 conta soltanto, senza scrivere.
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prova = req.nextUrl.searchParams.get("prova") === "1";
  let elenco: AnagraficaBConsole[];
  try {
    elenco = JSON.parse(await req.text());
    if (!Array.isArray(elenco)) throw new Error("serve un array");
  } catch (e) {
    return NextResponse.json({ error: `JSON non valido: ${(e as Error).message}` }, { status: 400 });
  }

  const [brand, utenti, esistenti] = await Promise.all([
    prisma.brand.findMany({ select: { id: true, nome: true } }),
    prisma.utente.findMany({ select: { id: true, username: true, nome: true } }),
    prisma.cliente.findMany({ select: { id: true, nome: true, telefono: true, cellulare: true, email: true, piva: true, codiceFiscale: true, bconsoleId: true } }),
  ]);
  const brandId = (nome: string) => (brand.find((b) => b.nome.toUpperCase() === nome.toUpperCase()) ?? brand.find((b) => b.nome === "P&C"))?.id;
  // per username, oppure per nome e cognome (se nel CRM l'utente ha uno username diverso da BConsole)
  const cercaUtente = (username: string) =>
    utenti.find((u) => u.username === username) ?? (NOMI_COMMERCIALI[username] ? utenti.find((u) => chiaveNomeCliente(u.nome) === chiaveNomeCliente(NOMI_COMMERCIALI[username])) : undefined);
  const utenteId = (username: string) => (cercaUtente(username) ?? cercaUtente(COMMERCIALE_DI_RISERVA))?.id ?? null;
  if (!brandId("P&C")) return NextResponse.json({ error: "manca il marchio P&C nel CRM" }, { status: 500 });

  const indice = indiceClienti(esistenti);
  const conta = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };
  const esito = { creati: 0, completati: 0, invariati: 0, doppioniUniti: 0, scartati: 0, perProvenienza: {} as Record<string, number>, perMarchio: {} as Record<string, number>, perCommerciale: {} as Record<string, number>, perStato: {} as Record<string, number>, esempiCompletati: [] as string[] };
  const daCreare: Prisma.ClienteCreateManyInput[] = [];

  for (const a of elenco) {
    const d = convertiAnagrafica(a);
    if (d.nome === "Senza nome" && !d.telefono && !d.email) { esito.scartati++; continue; }
    const trovato = indice.trova(d);
    if (trovato?.id.startsWith("nuovo-")) { esito.doppioniUniti++; continue; }
    if (trovato) {
      const completo = await prisma.cliente.findUniqueOrThrow({ where: { id: trovato.id } });
      const extra = completaCliente(completo as unknown as Record<string, unknown>, d);
      if (Object.keys(extra).length === 0) { esito.invariati++; continue; }
      if (!prova) await prisma.cliente.update({ where: { id: trovato.id }, data: extra });
      esito.completati++;
      if (esito.esempiCompletati.length < 15) esito.esempiCompletati.push(`${completo.nome}: ${Object.keys(extra).join(", ")}`);
      continue;
    }
    const m = marchio(a);
    const commerciale = usernameCommerciale(a);
    const creato = daOraRoma(dataRoma(a.creatoIl, a.creatoOra));
    daCreare.push({ ...d, brandId: brandId(m)!, responsabileId: utenteId(commerciale), ...(creato ? { createdAt: creato } : {}) });
    // nel blocco stesso: due anagrafiche BConsole della stessa persona diventano un solo cliente
    indice.aggiungi({ id: `nuovo-${daCreare.length}`, nome: d.nome, telefono: d.telefono, cellulare: d.cellulare, email: d.email, piva: d.piva, codiceFiscale: d.codiceFiscale, bconsoleId: d.bconsoleId });
    esito.creati++;
    conta(esito.perProvenienza, d.origine);
    conta(esito.perMarchio, m);
    conta(esito.perCommerciale, cercaUtente(commerciale) ? commerciale : COMMERCIALE_DI_RISERVA);
    conta(esito.perStato, d.statoLead ?? "(nessuno)");
  }
  if (!prova && daCreare.length) await prisma.cliente.createMany({ data: daCreare });

  return NextResponse.json({ prova, ricevuti: elenco.length, ...esito });
}
