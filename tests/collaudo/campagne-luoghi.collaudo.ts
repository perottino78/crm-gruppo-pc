// Collaudo: province e comuni multipli nel pubblico delle campagne (richiesta di Ugo 20/11/2026): la provincia si ricava dal CAP e dal comune all'importazione,
// «completa le province» sistema quelli già importati, il filtro prende più province e più comuni insieme.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/campagne-luoghi.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { importaRighe } from "../../src/lib/lead/importa-server";
import { righeDaCsv } from "../../src/lib/lead/importa";
import { creaCampagna, salvaCampagna, completaProvince } from "../../src/app/campagne-actions";
import { contaDestinatari, filtriCampagna } from "../../src/lib/campagne/motore";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | string[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const x = (e as { digest?: string }).digest ?? ""; if (!x.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(x.split(";")[2] ?? ""); } };
const idDa = (url: string | null) => url?.match(/\/campagne\/([a-z0-9]+)/)?.[1] ?? "";
const quanti = async (id: string) => (await contaDestinatari(await filtriCampagna(await prisma.campagna.findUniqueOrThrow({ where: { id } })))).raggiungibili;

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "CampagnaInvio","CampagnaVariante","Campagna","Lead","Cliente","Configurazione","Utente","Brand" CASCADE');
  const pc = await prisma.brand.create({ data: { nome: "P&C" } });
  const rocco = await prisma.utente.create({ data: { nome: "Rocco Zaccaro", email: "rocco@x.it", username: "rocco", ruolo: "MARKETING" } });
  g.__utente = rocco;

  console.log("1. Importazione per le campagne: la provincia si ricava da sola");
  const csv = [
    "Nome e cognome;Email;Comune;CAP",
    "Mario Rossi;mario@x.it;Rosta;10090",
    "Anna Bianchi;anna@x.it;Cuneo;12100",
    "Luca Verdi;luca@x.it;Milano;20121",
    "Paola Neri;paola@x.it;Rosta;",
    "Carlo Gialli;carlo@x.it;Bergamo (BG);",
    "Gino Ignoto;gino@x.it;;",
    "Elena Blu;elena@x.it;Avigliana;0118",
  ].join("\r\n");
  const l = righeDaCsv(csv);
  const r = await importaRighe(l.righe, "CAMPAGNE", true, "luoghi.csv", { id: rocco.id, nome: "Rocco" });
  verifica(r.ok && r.creati === 7, "7 contatti importati", r);
  const prov = async (n: string) => (await prisma.cliente.findFirst({ where: { nome: n } }))?.provincia;
  verifica((await prov("Mario Rossi")) === "TO", "Rosta + 10090 → TO", await prov("Mario Rossi"));
  verifica((await prov("Anna Bianchi")) === "CN", "Cuneo + 12100 → CN", await prov("Anna Bianchi"));
  verifica((await prov("Luca Verdi")) === "MI", "Milano → MI");
  verifica((await prov("Paola Neri")) === "TO", "solo comune Rosta → TO", await prov("Paola Neri"));
  verifica((await prov("Carlo Gialli")) === "BG", "«Bergamo (BG)» → BG", await prov("Carlo Gialli"));
  verifica((await prov("Gino Ignoto")) === null, "senza dati resta senza provincia");
  verifica((await prov("Elena Blu")) === "RM", "CAP 0118 (zero tolto da Excel) → RM, vince il CAP", await prov("Elena Blu"));

  console.log("2. Filtro con più province e più comuni");
  const a = idDa(await dove(creaCampagna(fd({ nome: "Nord Ovest" }))));
  await dove(salvaCampagna(fd({ id: a, oggetto: "x", testo: "y", province: ["TO", "CN"] })));
  verifica((await quanti(a)) === 3, "TO + CN = Mario, Paola, Anna", await quanti(a));
  await dove(salvaCampagna(fd({ id: a, oggetto: "x", testo: "y", province: ["TO", "CN"], comuni: ["Milano"] })));
  verifica((await quanti(a)) === 4, "TO + CN + il comune Milano = 4", await quanti(a));
  await dove(salvaCampagna(fd({ id: a, oggetto: "x", testo: "y", comuni: ["rosta", "BERGAMO (BG)"] })));
  verifica((await quanti(a)) === 3, "i comuni Rosta (2) e «Bergamo (BG)» (1), maiuscole indifferenti", await quanti(a));
  await dove(salvaCampagna(fd({ id: a, oggetto: "x", testo: "y", province: ["XX", "to"] })));
  const c = await prisma.campagna.findUniqueOrThrow({ where: { id: a } });
  verifica(c.province.length === 1 && c.province[0] === "TO", "sigle sbagliate scartate, minuscole sistemate", c.province);
  await dove(salvaCampagna(fd({ id: a, oggetto: "x", testo: "y" })));
  verifica((await quanti(a)) === 7, "nessuna scelta = ovunque", await quanti(a));

  console.log("3. Province scritte per esteso nell'anagrafica");
  await prisma.cliente.create({ data: { nome: "Vecchio Cliente", brandId: pc.id, email: "v@x.it", provincia: "Torino" } });
  await prisma.cliente.create({ data: { nome: "Altro Cliente", brandId: pc.id, email: "o@x.it", provincia: "to" } });
  await dove(salvaCampagna(fd({ id: a, oggetto: "x", testo: "y", province: ["TO"] })));
  verifica((await quanti(a)) === 4, "«Torino» e «to» contano come TO (2 + 2)", await quanti(a));

  console.log("4. Completa le province dei contatti già importati");
  await prisma.cliente.create({ data: { nome: "Importato Prima", brandId: pc.id, email: "p@x.it", comune: "Saluzzo", cap: "12037" } });
  await prisma.cliente.create({ data: { nome: "Senza Luogo", brandId: pc.id, email: "s@x.it" } });
  const url = await dove(completaProvince(fd({ id: a, province: ["TO", "CN"] })));
  verifica(/ok=/.test(url ?? ""), "messaggio di esito", url);
  verifica((await prov("Importato Prima")) === "CN", "Saluzzo / 12037 → CN", await prov("Importato Prima"));
  verifica((await prov("Senza Luogo")) === null, "senza comune né CAP resta vuoto");
  verifica((await prov("Mario Rossi")) === "TO", "chi ce l'aveva non cambia");
  const salvata = await prisma.campagna.findUniqueOrThrow({ where: { id: a } });
  verifica(salvata.province.join() === "TO,CN", "le scelte della pagina sono state salvate", salvata.province);

  console.log(`\n${ok} ok, ${ko} errori`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
