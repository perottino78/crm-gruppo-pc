// Collaudo: import lead/clienti da BConsole → provenienza, stato, commerciale, marchio; niente doppioni.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/clienti.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { POST } from "../../src/app/api/admin/importa-clienti-bconsole/route";
import type { AnagraficaBConsole } from "../../src/lib/clienti/bconsole";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const chiama = async (corpo: unknown, q = "") =>
  (await POST(new NextRequest(`http://localhost/api/admin/importa-clienti-bconsole?${q}`, { method: "POST", headers: { "x-seed-key": process.env.SEED_SECRET || "gpc-2026-seed-x7f2" }, body: JSON.stringify(corpo) }))).json();

const LEAD: AnagraficaBConsole[] = [
  { idAna: "33782", categoria: "Lead", creatoIl: "26/10/2026", creatoOra: "12:31", ragioneSociale: "BORI BARBARA", telefono: "3427681107", email: "barbara.bori@gmail.com", origine: "QUOTALO", stato: "Ricontattare", venditore: "MPI", tag: ["META VETRATE P&C"] },
  { idAna: "33628", categoria: "Lead", creatoIl: "13/10/2026", creatoOra: "09:23", ragioneSociale: "Ceparano Arnaldo", telefono: "3337370376", email: "arnaldo.ceparano@alice.it", origine: "Fiera", stato: "CALDO (interessato)", venditore: "UPE", note: "FIERA DEL FUNGO DI GIAVENO 11/10/2026" },
  { idAna: "30001", categoria: "Lead", creatoIl: "02/07/2026", ragioneSociale: "Rossi Luca", telefono: "+39 340 000 1111", origine: "", stato: "COMPRATO MA NON DA NOI", venditore: "MZ", tag: ["META PREVENTIVO ONLINE SOLARIS"] },
  // stessa persona di Rossi Luca, seconda richiesta in BConsole: deve diventare un solo cliente
  { idAna: "30002", categoria: "Lead", creatoIl: "05/07/2026", ragioneSociale: "LUCA ROSSI", telefono: "3400001111", origine: "FACEBOOK", venditore: "NDA" },
  { idAna: null, categoria: "Account,Cliente", creatoIl: "15/03/2026", ragioneSociale: "EDIL ROSTA SRL", piva: "IT01234567890", email: "info@edilrosta.it", origine: "PASSA PAROLA" },
  { idAna: "30003", categoria: "Lead", ragioneSociale: "", telefono: "", email: "" },
];

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "Cliente","Utente","Brand" CASCADE');
  for (const nome of ["P&C", "Solaris", "Purafonte", "Work & Services"]) await prisma.brand.create({ data: { nome } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@x.it", username: "uperottino", ruolo: "AMMINISTRATORE" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "marco@x.it", username: "mpiccatti", ruolo: "COMMERCIALE" } });
  const pc = await prisma.brand.findFirstOrThrow({ where: { nome: "P&C" } });
  // Già nel CRM, inserito a mano con provenienza diversa: non va duplicato né sovrascritto
  await prisma.cliente.create({ data: { nome: "Arnaldo Ceparano", telefono: "333 7370376", brandId: pc.id, origine: "UFFICIO", responsabileId: marco.id } });

  console.log("1. Prova a vuoto");
  const p = await chiama(LEAD, "prova=1");
  verifica(p.creati === 3 && p.completati === 1 && p.doppioniUniti === 1 && p.scartati === 1, "3 nuovi, 1 completato, 1 doppione unito, 1 vuoto scartato", p);
  verifica((await prisma.cliente.count()) === 1, "non scrive niente");

  console.log("2. Caricamento");
  await chiama(LEAD);
  const tutti = await prisma.cliente.findMany({ include: { brand: true, responsabile: true } });
  verifica(tutti.length === 4, "4 clienti in tutto", tutti.map((c) => c.nome));
  const bori = tutti.find((c) => c.bconsoleId === "33782")!;
  verifica(bori.nome === "Bori Barbara" && bori.origine === "QUOTALO" && bori.statoLead === "Ricontattare" && bori.responsabileId === marco.id && bori.brand.nome === "P&C", "Bori: provenienza, stato, Piccatti, P&C", bori);
  verifica(bori.createdAt.toISOString() === "2026-10-26T11:31:00.000Z", "data di arrivo in ora di Roma", bori.createdAt);
  const cep = tutti.find((c) => c.nome === "Arnaldo Ceparano")!;
  verifica(cep.origine === "UFFICIO" && cep.responsabileId === marco.id && cep.email === "arnaldo.ceparano@alice.it" && cep.bconsoleId === "33628" && cep.statoLead === "CALDO (interessato)", "Ceparano: completati email, n. BConsole e stato; provenienza e commerciale intatti", cep);
  const rossi = tutti.find((c) => c.bconsoleId === "30001")!;
  verifica(rossi.brand.nome === "Solaris" && rossi.responsabileId === ugo.id && rossi.origine === "FACEBOOK" && rossi.statoLead === "COMPRATO MA NON DA NOI", "Rossi: Solaris, commerciale non trovato → Ugo", rossi);
  const edil = tutti.find((c) => c.piva === "01234567890")!;
  verifica(edil && edil.categoria === "Account, Cliente" && edil.tipoAnagrafica === "AZIENDA" && edil.origine?.startsWith("PASSAPAROLA"), "Edil Rosta: cliente azienda, passaparola", edil);

  console.log("3. Rilanciato: niente doppioni");
  const r2 = await chiama(LEAD);
  verifica(r2.creati === 0 && r2.completati === 0, "nessun nuovo e nessuna modifica", r2);
  verifica((await prisma.cliente.count()) === 4, "sempre 4 clienti");

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
