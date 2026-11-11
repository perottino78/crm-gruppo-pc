// Collaudo (richieste di Rocco, PDF «modifiche per PC ONE», preventivi parte 1): numero progressivo, nuovo preventivo
// dalla pagina dedicata, immagine dell'offerta salvata da sola senza toccare le condizioni.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/preventivi-nuovo.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { creaPreventivo, duplicaPreventivo, aggiornaImmagineOfferta, aggiornaCondizioniOfferta } from "../../src/app/actions";
import { testoValidita } from "../../src/lib/condizioniOfferta";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const x = (e as { digest?: string }).digest ?? ""; if (!x.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(x.split(";")[2] ?? ""); } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaPreventivo","SezionePreventivo","Preventivo","Cliente","Utente","Brand" CASCADE');
  const pc = await prisma.brand.create({ data: { nome: "P&C" } });
  const sol = await prisma.brand.create({ data: { nome: "Solaris" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco", email: "m@x.it", username: "marco", ruolo: "COMMERCIALE" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const cli = await prisma.cliente.create({ data: { nome: "Mario Rossi", brandId: pc.id } });
  g.__utente = ugo;

  console.log("1. Numero progressivo");
  // un'offerta senza numero (es. presa in carico da BConsole) faceva ripartire sempre da 1
  await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: pc.id, commercialeId: marco.id } });
  const vai = async () => { const r = await dove(creaPreventivo(fd({ clienteId: cli.id, brandId: pc.id, commercialeId: marco.id }))); return prisma.preventivo.findUniqueOrThrow({ where: { id: r!.split("/").pop()! } }); };
  const a = await vai(), b = await vai(), c = await vai();
  verifica(a.numeroOfferta === 1 && b.numeroOfferta === 2 && c.numeroOfferta === 3, "1, 2, 3 anche se c'è un'offerta senza numero", [a.numeroOfferta, b.numeroOfferta, c.numeroOfferta]);
  const r = await dove(duplicaPreventivo(fd({ id: b.id })));
  const copia = await prisma.preventivo.findUniqueOrThrow({ where: { id: r!.split("/").pop()! } });
  verifica(copia.numeroOfferta === 4, "la copia prende il numero successivo", copia.numeroOfferta);
  const s1 = await dove(creaPreventivo(fd({ clienteId: cli.id, brandId: sol.id, commercialeId: marco.id })));
  verifica((await prisma.preventivo.findUniqueOrThrow({ where: { id: s1!.split("/").pop()! } })).numeroOfferta === 1, "ogni marchio ha la sua numerazione");

  console.log("2. Nuovo preventivo dalla pagina dedicata");
  const senza = await dove(creaPreventivo(fd({ clienteId: "", brandId: pc.id, commercialeId: marco.id })));
  verifica(senza?.startsWith("/preventivi/nuovo?") && senza.includes("cliente"), "senza cliente torna alla pagina con l'avviso", senza);
  const conOggetto = await dove(creaPreventivo(fd({ clienteId: cli.id, brandId: pc.id, commercialeId: marco.id, oggetto: "Serramenti PVC" })));
  const o = await prisma.preventivo.findUniqueOrThrow({ where: { id: conOggetto!.split("/").pop()! } });
  verifica(o.oggetto === "Serramenti PVC" && o.scadenza && o.stato === "APERTO", "oggetto salvato, validità di partenza", o);

  console.log("3. Immagine dell'offerta");
  await aggiornaImmagineOfferta(fd({ id: o.id, immagineCopertinaUrl: "data:image/jpeg;base64,AAA" }));
  await aggiornaCondizioniOfferta(fd({ id: o.id, oggetto: "Serramenti PVC e zanzariere", condizioniPagamento: "Bonifico", condizioniConsegna: "60 gg" }));
  const dopo = await prisma.preventivo.findUniqueOrThrow({ where: { id: o.id } });
  verifica(dopo.immagineCopertinaUrl === "data:image/jpeg;base64,AAA" && dopo.oggetto === "Serramenti PVC e zanzariere", "le condizioni non cancellano l'immagine", dopo.immagineCopertinaUrl);
  await prisma.preventivo.update({ where: { id: o.id }, data: { confermatoIl: new Date() } });
  await aggiornaImmagineOfferta(fd({ id: o.id, immagineCopertinaUrl: "" }));
  verifica((await prisma.preventivo.findUniqueOrThrow({ where: { id: o.id } })).immagineCopertinaUrl === "data:image/jpeg;base64,AAA", "offerta confermata: l'immagine non si cambia");

  console.log("4. Testi della stampa");
  verifica(testoValidita(new Date("2026-11-26T23:30:00Z")) === "Offerta valida fino al 27/11/2026", "validità con la data di Roma", testoValidita(new Date("2026-11-26T23:30:00Z")));

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
