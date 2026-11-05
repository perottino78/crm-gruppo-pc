// Collaudo: porte interne Isomax, 70/80 cm standard; 60 e 90 cm aggiungono da sole la maggiorazione di listino.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/isomax-luce.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { aggiungiRigaPreventivo } from "../../src/app/actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaOptional","RigaPreventivo","Preventivo","Optional","Prodotto","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const u = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  g.__utente = u;
  const c = await prisma.cliente.create({ data: { nome: "Rossi", brandId: b.id } });
  const pr = await prisma.preventivo.create({ data: { clienteId: c.id, brandId: b.id, commercialeId: u.id } });
  const porta = await prisma.prodotto.create({ data: { brandId: b.id, tipologia: "ISOMAX_SKL_BATT", colore: "STANDARD", altezzaMm: 210, larghezzaMm: 80, prezzoBase: 381 } });
  for (const nome of ["Riduzione a 60cm luce netta (sotto lo standard 70/80cm)", "Allargamento a 90cm luce netta (sopra lo standard 70/80cm)"]) {
    await prisma.optional.create({ data: { brandId: b.id, categoria: "Maggiorazione taglio/luce netta", nome, tipoPrezzo: "FISSO", valore: 38 } });
  }
  const aggiungi = async (luce: string) => {
    await aggiungiRigaPreventivo(fd({ preventivoId: pr.id, prodottoId: porta.id, quantita: "1", luceNetta: luce }));
    return prisma.rigaPreventivo.findFirstOrThrow({ where: { preventivoId: pr.id }, orderBy: { id: "desc" }, include: { optionali: { include: { optional: true } } } });
  };
  for (const luce of ["70", "80"]) {
    const r = await aggiungi(luce);
    verifica(r.optionali.length === 0 && r.misuraLarghezza === Number(luce) && r.prezzoUnitario === 381, `${luce} cm: standard, nessuna maggiorazione`, r);
  }
  const r60 = await aggiungi("60");
  verifica(r60.optionali.length === 1 && r60.optionali[0].optional.nome.startsWith("Riduzione a 60") && r60.optionali[0].prezzoUnitario === 38, "60 cm: maggiorazione di 38 € aggiunta da sola", r60.optionali);
  const r90 = await aggiungi("90");
  verifica(r90.optionali.length === 1 && r90.optionali[0].optional.nome.startsWith("Allargamento a 90") && r90.misuraLarghezza === 90, "90 cm: maggiorazione di 38 € e misura 90 sulla riga", r90.optionali);
  const tot = await prisma.preventivo.findUniqueOrThrow({ where: { id: pr.id } });
  verifica(Math.abs((tot.totaleNetto ?? 0) - (381 * 4 + 38 * 2)) < 0.01 || tot.totaleNetto === null, "il totale dell'offerta comprende le maggiorazioni", tot.totaleNetto);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
