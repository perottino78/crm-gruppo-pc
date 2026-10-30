// Collaudo: import del personale da BConsole → crea senza password, completa senza toccare il ruolo, non duplica.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/utenti.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { POST } from "../../src/app/api/admin/importa-utenti-bconsole/route";
import { PERSONALE_BCONSOLE } from "../../src/lib/utenti/bconsole";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const chiama = async (q: string, key = process.env.SEED_SECRET || "gpc-2026-seed-x7f2") =>
  POST(new NextRequest(`http://localhost/api/admin/importa-utenti-bconsole?${q}`, { method: "POST", headers: { "x-seed-key": key } }));

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "Utente","Brand" CASCADE');
  for (const nome of ["P&C", "Solaris", "Purafonte", "Work & Services", "PTC"]) await prisma.brand.create({ data: { nome } });
  await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo.perottino@gruppopec.com", username: "uperottino", ruolo: "AMMINISTRATORE" } });
  // Già inserito a mano, scritto al contrario e con un ruolo diverso: non va duplicato né cambiato di ruolo
  await prisma.utente.create({ data: { nome: "Piccatti Marco", email: "marco.piccatti@gruppopec.com", ruolo: "AMMINISTRATIVO" } });

  console.log("1. Senza chiave");
  verifica((await chiama("prova=1", "sbagliata")).status === 401, "rifiuta senza chiave");

  console.log("2. Prova a vuoto");
  const p = await (await chiama("prova=1")).json();
  verifica(p.creati.length === PERSONALE_BCONSOLE.length - 1 && p.completati.length === 1, "propone 14 nuovi e 1 da completare", p);
  verifica((await prisma.utente.count()) === 2, "non scrive niente");

  console.log("3. Caricamento");
  const r = await (await chiama("")).json();
  verifica(r.creati.length === 14, "crea 14 utenti");
  const tutti = await prisma.utente.findMany({ include: { brandAutorizzati: true } });
  verifica(tutti.length === 16, "16 utenti in tutto");
  verifica(tutti.every((u) => !u.passwordHash), "nessuno ha la password: non entrano finché non si attivano");
  const marco = tutti.find((u) => u.email === "marco.piccatti@gruppopec.com")!;
  verifica(marco.ruolo === "AMMINISTRATIVO" && marco.username === "mpiccatti" && marco.ufficio === "COMMERCIALE", "Piccatti: ruolo scritto a mano intatto, completati username e ufficio", marco);
  const laura = tutti.find((u) => u.username === "lpinto")!;
  verifica(laura.brandAutorizzati.map((b) => b.nome).sort().join(",") === "P&C,Purafonte,Solaris,Work & Services", "Laura Pinto: Solaris, P&C, Purafonte, Work", laura.brandAutorizzati.map((b) => b.nome));
  verifica(tutti.find((u) => u.username === "vpaolo")!.brandAutorizzati.map((b) => b.nome).join() === "Solaris", "Visconti: solo Solaris");
  verifica(tutti.find((u) => u.username === "dgirodo")!.ruolo === "AMMINISTRATORE", "Debora amministratore");
  verifica(tutti.find((u) => u.username === "mpec")!.ufficio === "MARKETING", "Rocco nell'ufficio Marketing");
  const paolo = tutti.find((u) => u.username === "psalvato")!;
  verifica(paolo.ufficio === "MAGAZZINO" && paolo.email.endsWith("@senza-email.invalid"), "Paolo Salvato in magazzino, email da completare");
  verifica(!tutti.some((u) => ["mzogno", "dconvertino", "bclaudio", "colariu"].includes(u.username ?? "")), "esclusi Zogno, Convertino, Boggiani, Bogdan");

  console.log("4. Rilanciato: niente doppioni");
  const r2 = await (await chiama("")).json();
  verifica(r2.creati.length === 0 && r2.completati.length === 0 && r2.invariati.length === 15, "tutto invariato", r2);
  verifica((await prisma.utente.count()) === 16, "sempre 16 utenti");

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
