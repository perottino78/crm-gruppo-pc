// Collaudo: eliminare un'offerta (anche con progetto Solaris Studio ed email inviate) → cestino → ripristino.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/elimina-offerta.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { eliminaPreventivo } from "../../src/app/actions";
import { ripristinaDalCestino } from "../../src/app/registro-actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "Cestino","RegistroAmministrazione","SolarisFoto","SolarisProgetto","EmailOfferta","RigaPreventivo","SezionePreventivo","Commessa","Preventivo","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "Solaris" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const cl = await prisma.cliente.create({ data: { nome: "Bianchi Luca", brandId: b.id } });
  const nuova = async () => {
    const p = await prisma.preventivo.create({ data: { clienteId: cl.id, brandId: b.id, commercialeId: ugo.id, numeroOfferta: 7 } });
    const s = await prisma.sezionePreventivo.create({ data: { preventivoId: p.id, nome: "Tetto" } });
    await prisma.rigaPreventivo.create({ data: { preventivoId: p.id, sezioneId: s.id, testoLibero: "Impianto 6 kWp", quantita: 1, prezzoUnitario: 9000 } });
    await prisma.emailOfferta.create({ data: { preventivoId: p.id, a: "l@x.it", oggetto: "La tua offerta", testo: "Ciao", stato: "INVIATA" } });
    const sp = await prisma.solarisProgetto.create({ data: { preventivoId: p.id, clienteId: cl.id, commercialeId: ugo.id } });
    await prisma.solarisFoto.create({ data: { progettoId: sp.id, nome: "tetto.jpg", dataUri: "data:image/jpeg;base64,AAAA" } });
    return p;
  };
  g.__utente = ugo;

  console.log("1. Offerta con progetto Solaris Studio ed email: si elimina (prima dava errore)");
  const p = await nuova();
  const x = await dove(eliminaPreventivo(fd({ id: p.id })));
  verifica(x?.includes("/preventivi?ok=") && x.includes("cestino"), "torna all'elenco con «nel cestino»", x);
  verifica(!(await prisma.preventivo.findUnique({ where: { id: p.id } })) && !(await prisma.solarisProgetto.count()) && !(await prisma.solarisFoto.count()) && !(await prisma.emailOfferta.count()), "offerta, progetto Solaris, foto ed email eliminati");
  const ce = await prisma.cestino.findFirstOrThrow({ where: { rifId: p.id } });
  verifica(ce.tipo === "PREVENTIVO" && ce.nome === "Offerta n. 7 — Bianchi Luca" && ce.eliminatoDaNome === "Ugo Perottino", "nel cestino con nome e chi l'ha eliminata", ce.nome);

  console.log("2. Ripristino dal cestino");
  const r = await dove(ripristinaDalCestino(fd({ id: ce.id })));
  const tornata = await prisma.preventivo.findUnique({ where: { id: p.id }, include: { righe: true, sezioni: true, solarisProgetto: true } });
  verifica(r?.includes("ripristinat") && tornata?.righe[0]?.sezioneId === tornata?.sezioni[0]?.id && tornata?.solarisProgetto && (await prisma.solarisFoto.count()) === 1 && (await prisma.emailOfferta.count()) === 1, "torna com'era: stanze, righe, progetto Solaris con le foto, email", r);

  console.log("3. Offerta con commessa: non si elimina, messaggio chiaro");
  await prisma.commessa.create({ data: { numero: 1, anno: 2026, preventivoId: p.id, clienteId: cl.id, brandId: b.id } });
  const y = await dove(eliminaPreventivo(fd({ id: p.id })));
  verifica(y?.includes("non eliminabile") && (await prisma.preventivo.count()) === 1, "resta, con l'avviso «usa Archivia»", y);

  console.log("4. Offerta già eliminata (doppio clic): niente pagina di errore");
  const z = await dove(eliminaPreventivo(fd({ id: "non-esiste" })));
  verifica(z?.includes(";/preventivi;"), "torna all'elenco", z);

  console.log(`\n${ok} ok, ${ko} falliti`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
