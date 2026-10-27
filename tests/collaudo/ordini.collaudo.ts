// Collaudo acquisti (ordini fornitori) e documenti, su database di PROVA.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/ordini.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import * as A from "../../src/app/ordini-actions";
import { generaRigheOrdine, aggiornaRigaOrdine } from "../../src/app/commesse-actions";
import { caricaDocumenti, eliminaDocumento } from "../../src/app/documenti-actions";
import { GET as scaricaDoc } from "../../src/app/api/documenti/[id]/route";
import { GET as pdfOrdine } from "../../src/app/api/ordini-fornitori/[id]/pdf/route";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | File | (string | File)[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x)); return f; };
const senzaRedirect = async (p: Promise<unknown>) => { try { await p; } catch (e) { if (!String((e as Error).message ?? e).includes("NEXT_REDIRECT") && !(e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e; } };
const lancia = async (p: Promise<unknown>) => { try { await p; return false; } catch { return true; } };

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "Documento","OrdineFornitore","RigaOrdine","CommessaEvento","Commessa","RigaOptional","RigaPreventivo","Preventivo","Prodotto","ModelloProdotto","Cliente","Soggetto","Utente","Brand" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const admin = await prisma.utente.create({ data: { nome: "Laura Ordini", email: "laura@prova.it", ruolo: "AMMINISTRATIVO" } });
  const capo = await prisma.utente.create({ data: { nome: "Capo", email: "capo@prova.it", ruolo: "AMMINISTRATORE" } });
  const comm = await prisma.utente.create({ data: { nome: "Mario Commerciale", email: "mario@prova.it", ruolo: "COMMERCIALE" } });
  const fint = await prisma.soggetto.create({ data: { ragioneSociale: "FORNITORE SERRAMENTI", ruoli: ["FORNITORE"], emailOrdini: "ordini@serramenti.it", scontoFornitore: 40 } });
  const spi = await prisma.soggetto.create({ data: { ragioneSociale: "FORNITORE PERSIANE", ruoli: ["FORNITORE"], email: "info@persiane.it", scontoFornitore: 30 } });
  await prisma.modelloProdotto.create({ data: { brandId: brand.id, tipologia: "FINESTRA_2A", fornitoreId: fint.id, codiceFornitore: "F/2F", scontoAcquisto: 45 } });
  await prisma.modelloProdotto.create({ data: { brandId: brand.id, tipologia: "PERSIANA_2A", fornitoreId: spi.id } });
  const pf = await prisma.prodotto.create({ data: { brandId: brand.id, tipologia: "FINESTRA_2A", colore: "Bianco", altezzaMm: 1000, larghezzaMm: 1100, prezzoBase: 1000 } });
  const pp = await prisma.prodotto.create({ data: { brandId: brand.id, tipologia: "PERSIANA_2A", colore: "Verde", altezzaMm: 1000, larghezzaMm: 1100, prezzoBase: 500 } });
  const cli = await prisma.cliente.create({ data: { nome: "ROSSI MARIO", brandId: brand.id, indirizzo: "Via Roma 1", cap: "10100", comune: "Torino", provincia: "TO" } });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: capo.id, oggetto: "Serramenti casa" } });
  await prisma.rigaPreventivo.createMany({ data: [
    { preventivoId: prev.id, prodottoId: pf.id, quantita: 2, prezzoUnitario: 1000, optionalPrezzo: 100, ordine: 1 },
    { preventivoId: prev.id, prodottoId: pp.id, quantita: 2, prezzoUnitario: 500, ordine: 2 },
    { preventivoId: prev.id, testoLibero: "Smaltimento vecchi infissi", quantita: 1, prezzoUnitario: 150, ordine: 3 },
  ] });
  const c = await prisma.commessa.create({ data: { numero: 7, anno: 2026, preventivoId: prev.id, clienteId: cli.id, brandId: brand.id } });

  console.log("1. Righe dalla commessa con fornitore e costo dal listino");
  g.__utente = admin;
  await generaRigheOrdine(fd({ id: c.id }));
  const righe = await prisma.rigaOrdine.findMany({ where: { commessaId: c.id }, orderBy: { createdAt: "asc" } });
  const rf = righe.find((r) => r.descrizione.startsWith("FINESTRA"))!, rp = righe.find((r) => r.descrizione.startsWith("PERSIANA"))!, rl = righe.find((r) => r.descrizione.startsWith("Smaltimento"))!;
  verifica(righe.length === 3, "3 righe generate");
  verifica(rf.fornitoreId === fint.id && rf.codiceFornitore === "F/2F" && rf.scontoAcquisto === 45 && rf.costoPrevisto === 1210, "finestra: fornitore, codice e costo con sconto del modello (1.100×2×55%)", rf);
  verifica(rp.fornitoreId === spi.id && rp.costoPrevisto === 700, "persiana: sconto generale del fornitore (500×2×70%)", rp);
  verifica(rl.fornitoreId === null && rl.costoPrevisto === null, "riga a testo libero senza fornitore");

  console.log("2. Permessi");
  g.__utente = comm;
  verifica(await lancia(A.creaOrdineDaCommessa(fd({ commessaId: c.id, fornitoreId: fint.id }))), "un commerciale non crea ordini");
  verifica(!(await A.inviaOrdineEmail("x", "a@b.it", "", "o", "t")).ok, "un commerciale non invia ordini");
  verifica((await pdfOrdine(new Request("http://x/"), { params: Promise.resolve({ id: "x" }) })).status === 401, "un commerciale non scarica il PDF");
  verifica(await prisma.ordineFornitore.count() === 0, "nessun ordine creato");

  console.log("3. Creazione ordini e numerazione");
  g.__utente = admin;
  await senzaRedirect(A.creaOrdineDaCommessa(fd({ commessaId: c.id, fornitoreId: fint.id })));
  const o1 = await prisma.ordineFornitore.findFirstOrThrow({ include: { righe: true } });
  verifica(o1.numero === 1 && o1.anno === new Date().getFullYear() && o1.righe.length === 1 && o1.righe[0].id === rf.id, "ordine 1 con la riga della finestra");
  verifica(o1.clienteFinale === "ROSSI MARIO - Via Roma 1 10100 Torino (TO)" && o1.riferimento === "Commessa 7/2026 - Serramenti casa" && o1.divisione === "P&C" && o1.stato === "BOZZA", "testata compilata", o1);
  await senzaRedirect(A.creaOrdineDaCommessa(fd({ commessaId: c.id, fornitoreId: fint.id })));
  verifica(await prisma.ordineFornitore.count() === 1, "nessun secondo ordine se non ci sono righe libere");
  await Promise.all([1, 2, 3].map(() => senzaRedirect(A.creaOrdineLibero(fd({ fornitoreId: spi.id, divisione: "Work & Services" })))));
  const nums = (await prisma.ordineFornitore.findMany({ orderBy: { numero: "asc" } })).map((o) => o.numero);
  verifica(JSON.stringify(nums) === "[1,2,3,4]", "tre ordini creati insieme: numeri 2, 3, 4 senza doppioni", nums);

  console.log("4. Righe e PDF");
  await A.aggiungiRigaAOrdine(fd({ ordineId: o1.id, descrizione: "Maniglia extra (prova)", quantita: "3", prezzoAcquisto: "12,50" }));
  await A.salvaRigaOrdineFornitore(fd({ rigaId: rf.id, codice: "ZEN/2F", codiceFornitore: "F/2F", descrizione: rf.descrizione, quantita: "2", um: "pz", prezzoAcquisto: "605", scontoAcquisto: "" }));
  const res = await pdfOrdine(new Request("http://x/?scarica=1"), { params: Promise.resolve({ id: o1.id }) });
  const pdf = Buffer.from(await res.arrayBuffer()).toString("latin1");
  verifica(res.status === 200 && pdf.startsWith("%PDF") && /attachment/.test(res.headers.get("content-disposition") ?? ""), "PDF scaricabile");
  verifica(pdf.includes("Maniglia extra \\(prova\\)") && pdf.includes("ROSSI MARIO"), "il PDF contiene righe e cliente");

  console.log("5. Invio: senza servizio configurato, poi con servizio simulato");
  delete process.env.EMAIL_PROVIDER;
  const e0 = await A.inviaOrdineEmail(o1.id, "ordini@serramenti.it", "", "Ordine 1", "Buongiorno");
  verifica(!e0.ok && e0.mailto?.startsWith("mailto:ordini@serramenti.it?subject=Ordine%201"), "senza configurazione: mailto pronto", e0);
  verifica((await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: o1.id } })).stato === "BOZZA", "resta in bozza");
  verifica(!(await A.inviaOrdineEmail(o1.id, "indirizzo sbagliato", "", "o", "t")).ok, "email non valida rifiutata");
  Object.assign(process.env, { EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "k", EMAIL_MITTENTE: "Ordini P&C <ordini@gruppopec.com>" });
  const vero = globalThis.fetch; let inviato: { url: string; body: { to: string[]; attachments: { filename: string; content: string }[]; reply_to: string } } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => { inviato = { url, body: JSON.parse(init.body as string) }; return new Response("{}", { status: 200 }); }) as typeof fetch;
  const e1 = await A.inviaOrdineEmail(o1.id, "ordini@serramenti.it", "ufficio@gruppopec.com", "Ordine 1", "Buongiorno");
  globalThis.fetch = vero;
  const i = inviato as unknown as { url: string; body: { to: string[]; attachments: { filename: string; content: string }[]; reply_to: string } };
  verifica(e1.ok && i.url === "https://api.resend.com/emails" && i.body.to[0] === "ordini@serramenti.it" && i.body.reply_to === "laura@prova.it", "email inviata al fornitore, risposte a chi ha emesso l'ordine", e1);
  verifica(Buffer.from(i.body.attachments[0].content, "base64").toString("latin1").startsWith("%PDF") && i.body.attachments[0].filename.endsWith(".pdf"), "PDF allegato");
  const o1b = await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: o1.id }, include: { righe: true } });
  verifica(o1b.stato === "INVIATO" && o1b.modalitaInvio === "EMAIL" && o1b.righe.every((r) => r.ordinato && r.ordinatoDaNome === "Laura Ordini"), "ordine inviato e righe segnate ordinate");
  globalThis.fetch = (async () => new Response("errore dominio", { status: 422 })) as typeof fetch;
  const e2 = await A.inviaOrdineEmail(o1.id, "ordini@serramenti.it", "", "Ordine 1", "x");
  globalThis.fetch = vero;
  verifica(!e2.ok && /422/.test(e2.messaggio), "errore del servizio mostrato chiaramente");
  await A.togliRigaDaOrdine(fd({ rigaId: rf.id }));
  verifica((await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: rf.id } })).ordineFornitoreId === o1.id, "non si tolgono righe da un ordine già inviato");

  console.log("6. Riga in ordine: fornitore bloccato dalla commessa");
  await aggiornaRigaOrdine(fd({ rigaId: rf.id, fornitoreId: spi.id, ordinato: "on" }));
  verifica((await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: rf.id } })).fornitoreId === fint.id, "il fornitore resta quello dell'ordine");
  await aggiornaRigaOrdine(fd({ rigaId: rp.id, fornitoreId: fint.id }));
  const rp2 = await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: rp.id } });
  verifica(rp2.fornitoreId === fint.id && rp2.costoPrevisto === null, "cambiando fornitore a una riga libera la stima vecchia si azzera");
  await aggiornaRigaOrdine(fd({ rigaId: rp.id, fornitoreId: spi.id }));
  await A.applicaFornitoriPredefiniti(fd({ commessaId: c.id }));
  verifica((await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: rp.id } })).costoPrevisto === 700, "«applica predefiniti» ricalcola la stima");

  console.log("7. Conferma, arrivi, annullamento");
  await A.registraConfermaFornitore(fd({ id: o1.id, numeroConfermaFornitore: "OF/26/10014", consegnaConfermata: "2026-11-20" }));
  const o1c = await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: o1.id }, include: { righe: true } });
  verifica(o1c.stato === "CONFERMATO" && o1c.numeroConfermaFornitore === "OF/26/10014" && o1c.consegnaConfermata?.toISOString().startsWith("2026-11-20"), "confermato dal fornitore");
  await A.registraArrivi(fd({ id: o1.id, arrivata: [rf.id] }));
  verifica((await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: o1.id } })).stato === "EVASO_PARZIALE", "arrivo parziale");
  verifica(await lancia(A.annullaOrdine(fd({ id: o1.id, motivo: "prova" }))), "non si annulla un ordine con merce arrivata");
  await A.registraArrivi(fd({ id: o1.id, arrivata: o1c.righe.map((r) => r.id) }));
  verifica((await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: o1.id } })).stato === "EVASO", "tutto arrivato");
  await A.registraArrivi(fd({ id: o1.id, arrivata: [] }));
  verifica((await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: o1.id } })).stato === "CONFERMATO", "togliendo gli arrivi torna confermato");
  await senzaRedirect(A.creaOrdineDaCommessa(fd({ commessaId: c.id, fornitoreId: spi.id })));
  const o5 = await prisma.ordineFornitore.findFirstOrThrow({ where: { commessaId: c.id, fornitoreId: spi.id } });
  verifica(o5.numero === 5, "ordine persiane numero 5");
  await A.annullaOrdine(fd({ id: o5.id, motivo: "cambio fornitore" }));
  const rp3 = await prisma.rigaOrdine.findUniqueOrThrow({ where: { id: rp.id } });
  verifica((await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: o5.id } })).stato === "ANNULLATO" && rp3.ordineFornitoreId === null && !rp3.ordinato, "annullato: la riga torna da ordinare");
  const eventi = (await prisma.commessaEvento.findMany({ where: { commessaId: c.id } })).map((e) => e.testo).join(" | ");
  verifica(/Creato ordine fornitore 1\//.test(eventi) && /inviato a ordini@serramenti.it/.test(eventi) && /OF\/26\/10014/.test(eventi) && /Merce arrivata/.test(eventi) && /annullato/.test(eventi), "storico della commessa completo");

  console.log("8. Documenti");
  const pdfFile = new File([new Uint8Array([37, 80, 68, 70, 45, 49])], "Conferma d'ordine.pdf", { type: "application/pdf" });
  const exe = new File([new Uint8Array([77, 90])], "virus.exe", { type: "application/x-msdownload" });
  const grande = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "grande.pdf", { type: "application/pdf" });
  const d1 = await caricaDocumenti(null, fd({ entita: "COMMESSA", entitaId: c.id, cartella: "Conferme d'ordine fornitori", file: [pdfFile, exe, grande] }));
  verifica(d1.ok && /1 file caricati/.test(d1.messaggio) && /virus.exe \(tipo non ammesso\)/.test(d1.messaggio) && /grande.pdf \(oltre 4 MB\)/.test(d1.messaggio), "carica il PDF, rifiuta eseguibili e file oltre 4 MB", d1);
  const doc = await prisma.documento.findFirstOrThrow();
  verifica(doc.nome === "Conferma d_ordine.pdf" && doc.dimensione === 6 && doc.caricatoDaNome === "Laura Ordini", "documento salvato");
  const r1 = await scaricaDoc(new Request("http://x/"), { params: Promise.resolve({ id: doc.id }) });
  verifica(r1.status === 200 && (await r1.text()) === "%PDF-1" && /inline/.test(r1.headers.get("content-disposition") ?? "") && r1.headers.get("x-content-type-options") === "nosniff", "download del documento");
  verifica(!(await caricaDocumenti(null, fd({ entita: "CLIENTE", entitaId: cli.id, file: [pdfFile] }))).ok, "sui clienti valgono le regole di visibilità del CRM (amministrativo non collegato: no)");
  g.__utente = capo;
  const d2 = await caricaDocumenti(null, fd({ entita: "CLIENTE", entitaId: cli.id, nuovaCartella: "Varianti", file: [pdfFile] }));
  verifica(d2.ok && /«Varianti»/.test(d2.messaggio), "cartella nuova", d2);
  g.__utente = comm;
  verifica((await scaricaDoc(new Request("http://x/"), { params: Promise.resolve({ id: doc.id }) })).status === 404, "un commerciale non vede i documenti di una commessa non sua");
  verifica(!(await caricaDocumenti(null, fd({ entita: "CLIENTE", entitaId: cli.id, file: [pdfFile] }))).ok, "né carica sul cliente di un altro");
  g.__utente = { ...admin, id: "altro", nome: "Altro Ufficio" };
  await eliminaDocumento(fd({ id: doc.id }));
  verifica(await prisma.documento.count({ where: { id: doc.id } }) === 1, "solo chi ha caricato (o l'amministratore) può eliminare");
  g.__utente = capo;
  await eliminaDocumento(fd({ id: doc.id }));
  verifica(await prisma.documento.count({ where: { id: doc.id } }) === 0, "l'amministratore elimina");
  g.__utente = null;
  verifica((await scaricaDoc(new Request("http://x/"), { params: Promise.resolve({ id: "x" }) })).status === 401, "senza accesso niente download");

  console.log(`\nRisultato: ${ok} superati, ${ko} falliti`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
