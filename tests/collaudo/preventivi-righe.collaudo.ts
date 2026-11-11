// Collaudo (richieste di Rocco, PDF «modifiche per PC ONE», preventivi parte 2): righe «prodotto/testo» nelle stanze,
// modifica delle righe di testo, prezzo manuale senza spunta (vuoto = calcolo dalle righe), IVA e sconto.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/preventivi-righe.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import {
  creaSezione, aggiungiRigaPreventivo, aggiungiRigaTestoLibero, modificaRigaPreventivo, duplicaRigaPreventivo,
  aggiornaPrezzoManuale, aggiornaIva, aggiornaSconto, rinominaSezione,
} from "../../src/app/actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const prev = (id: string) => prisma.preventivo.findUniqueOrThrow({ where: { id }, include: { righe: { orderBy: [{ ordine: "asc" }, { id: "asc" }] }, sezioni: true } });

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RigaOptional","RigaPreventivo","SezionePreventivo","Preventivo","Prodotto","Cliente","Utente","Brand" CASCADE');
  const pc = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const cli = await prisma.cliente.create({ data: { nome: "Mario Rossi", brandId: pc.id } });
  const prodotto = await prisma.prodotto.create({ data: { brandId: pc.id, tipologia: "PORTA_TEST", colore: "Bianco", altezzaMm: 0, larghezzaMm: 0, prezzoBase: 500 } });
  const altro = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: pc.id, commercialeId: ugo.id } });
  const p = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: pc.id, commercialeId: ugo.id, aliquotaIva: 22 } });
  g.__utente = ugo;

  console.log("1. Righe nelle stanze");
  await creaSezione(fd({ preventivoId: p.id, nome: "Cucina" }));
  const cucina = (await prev(p.id)).sezioni[0];
  const aggiunta = await aggiungiRigaPreventivo(fd({ preventivoId: p.id, prodottoId: prodotto.id, quantita: "2", sezioneId: cucina.id }));
  const nuova = aggiunta ? await prisma.rigaPreventivo.findUnique({ where: { id: aggiunta.rigaId } }) : null;
  verifica(nuova?.sezioneId === cucina.id && nuova.quantita === 2, "la finestra «negozio» riceve la riga appena aggiunta (per aprirne gli optional)", aggiunta);
  await aggiungiRigaTestoLibero(fd({ preventivoId: p.id, testoLibero: "Smontaggio vecchie porte", prezzoUnitario: "150", sezioneId: cucina.id }));
  await aggiungiRigaPreventivo(fd({ preventivoId: p.id, prodottoId: prodotto.id }));
  let x = await prev(p.id);
  const inCucina = x.righe.filter((r) => r.sezioneId === cucina.id);
  verifica(inCucina.length === 2 && inCucina[0].prodottoId === prodotto.id && inCucina[1].testoLibero, "prodotto e testo finiscono nella stanza, in ordine", inCucina.map((r) => r.ordine));
  verifica(x.righe.filter((r) => !r.sezioneId).length === 1, "senza sezione scelta resta fuori dalle stanze");
  // una stanza di un'altra offerta non si usa
  await creaSezione(fd({ preventivoId: altro.id, nome: "Altra" }));
  const estranea = (await prev(altro.id)).sezioni[0];
  await aggiungiRigaPreventivo(fd({ preventivoId: p.id, prodottoId: prodotto.id, sezioneId: estranea.id }));
  x = await prev(p.id);
  verifica(!x.righe.some((r) => r.sezioneId === estranea.id), "una stanza di un'altra offerta viene ignorata");
  verifica(x.totaleNetto === 2 * 500 + 150 + 500 + 500, "totale ricalcolato", x.totaleNetto);
  await rinominaSezione(fd({ id: cucina.id, preventivoId: p.id, nome: "Cucina e soggiorno" }));
  verifica((await prev(p.id)).sezioni[0].nome === "Cucina e soggiorno", "il nome della stanza si salva");

  console.log("2. Righe di testo: modifica e duplica");
  const testo = x.righe.find((r) => r.testoLibero)!;
  await modificaRigaPreventivo(fd({ id: testo.id, preventivoId: p.id, testoLibero: "Smontaggio e smaltimento vecchie porte", prezzoUnitario: "180,50" }));
  const t2 = await prisma.rigaPreventivo.findUniqueOrThrow({ where: { id: testo.id } });
  verifica(t2.testoLibero === "Smontaggio e smaltimento vecchie porte" && t2.prezzoUnitario === 180.5, "testo e importo modificati", t2);
  await duplicaRigaPreventivo(fd({ id: testo.id, preventivoId: p.id }));
  verifica((await prisma.rigaPreventivo.count({ where: { preventivoId: p.id, testoLibero: "Smontaggio e smaltimento vecchie porte", sezioneId: cucina.id } })) === 2, "la copia resta nella stessa stanza");

  console.log("3. IVA, sconto e prezzo manuale");
  await aggiornaSconto(fd({ id: p.id, scontoPercentuale: "10" }));
  await aggiornaIva(fd({ id: p.id, aliquotaPreset: "10" }));
  x = await prev(p.id);
  const lordo = 1000 + 180.5 * 2 + 500 + 500;
  verifica(Math.abs(x.totaleNetto - lordo * 0.9) < 0.01 && Math.abs(x.totaleIva - lordo * 0.9 * 0.1) < 0.01, "sconto 10% e IVA 10%", [x.totaleNetto, x.totaleIva]);
  await aggiornaPrezzoManuale(fd({ id: p.id, prezzoManualeTotale: "2200" }));
  x = await prev(p.id);
  verifica(x.prezzoManualeAttivo && x.prezzoManualeTotale === 2200 && x.aliquotaIva === 10, "prezzo scritto = offerta a corpo, l'IVA resta quella scelta", [x.prezzoManualeAttivo, x.aliquotaIva]);
  verifica(Math.abs(x.totaleNetto + x.totaleIva - 2200) < 0.01, "il totale è il prezzo manuale", x.totaleNetto + x.totaleIva);
  await aggiornaPrezzoManuale(fd({ id: p.id, prezzoManualeTotale: "" }));
  x = await prev(p.id);
  verifica(!x.prezzoManualeAttivo && Math.abs(x.totaleNetto - lordo * 0.9) < 0.01, "cancellato il prezzo si torna al calcolo dalle righe", x.totaleNetto);

  console.log("4. Offerta confermata: niente modifiche");
  await prisma.preventivo.update({ where: { id: p.id }, data: { confermatoIl: new Date() } });
  await aggiungiRigaTestoLibero(fd({ preventivoId: p.id, testoLibero: "riga tardiva", sezioneId: cucina.id }));
  await modificaRigaPreventivo(fd({ id: testo.id, preventivoId: p.id, testoLibero: "cambiata", prezzoUnitario: "1" }));
  verifica(!(await prisma.rigaPreventivo.findFirst({ where: { testoLibero: "riga tardiva" } })) && (await prisma.rigaPreventivo.findUniqueOrThrow({ where: { id: testo.id } })).testoLibero !== "cambiata", "righe bloccate dopo la conferma");

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
