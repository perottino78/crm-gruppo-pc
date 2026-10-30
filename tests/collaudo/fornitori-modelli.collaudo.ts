// Collaudo: fornitore dei modelli — assegnazione a tutti, a un gruppo, riga singola, togliere il fornitore.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/fornitori-modelli.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { salvaFornitoreModelli } from "../../src/app/ordini-actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); return f; };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "ModelloProdotto","Soggetto","Utente","Brand" CASCADE');
  const pc = await prisma.brand.create({ data: { nome: "P&C" } });
  g.__utente = await prisma.utente.create({ data: { nome: "Ugo", email: "u@x.it", username: "u", ruolo: "AMMINISTRATORE" } });
  const alias = await prisma.soggetto.create({ data: { ragioneSociale: "ALIAS SRL", ruoli: ["FORNITORE"] } });
  const m = await Promise.all(["BLINDATI CL3", "BLINDATI CL4", "CANCELLI ADA"].map((t) => prisma.modelloProdotto.create({ data: { brandId: pc.id, tipologia: t, famiglia: "INDOOR", gruppo: t.split(" ")[0] } })));
  const forn = async (i: number) => (await prisma.modelloProdotto.findUniqueOrThrow({ where: { id: m[i].id } }));

  console.log("1. Assegna a tutti i modelli trovati (ricerca BLINDATI)");
  const dove = await redirectA(salvaFornitoreModelli(fd({ modelloId: [m[0].id, m[1].id], fornitoreId: alias.id, ritorno: "?brand=x&q=BLINDATI" })));
  verifica((await forn(0)).fornitoreId === alias.id && (await forn(1)).fornitoreId === alias.id && (await forn(2)).fornitoreId === null, "solo i 2 blindati hanno ALIAS");
  verifica(dove?.includes("/prodotti/fornitori?brand=x&q=BLINDATI&fatto=2 modelli → ALIAS SRL"), "torna alla stessa ricerca con la conferma", dove);

  console.log("2. Riga singola con codice e sconto");
  await redirectA(salvaFornitoreModelli(fd({ modelloId: m[2].id, fornitoreId: alias.id, codiceFornitore: "ADA-01", scontoAcquisto: "35", ritorno: "?" })));
  const c = await forn(2);
  verifica(c.fornitoreId === alias.id && c.codiceFornitore === "ADA-01" && c.scontoAcquisto === 35, "fornitore, codice e sconto salvati", c);

  console.log("3. Togli il fornitore a un gruppo");
  const d2 = await redirectA(salvaFornitoreModelli(fd({ modelloId: [m[0].id], fornitoreId: "__nessuno__", ritorno: "?" })));
  verifica((await forn(0)).fornitoreId === null && (await forn(1)).fornitoreId === alias.id, "tolto solo dove richiesto");
  verifica(d2?.includes("fatto=1 modello → senza fornitore"), "conferma 'senza fornitore'", d2);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
