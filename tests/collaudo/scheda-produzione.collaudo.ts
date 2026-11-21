// Schede di produzione HTML per il fornitore: modello → compilazione con le misure definitive → documento della pratica da allegare all'ordine.
import { prisma } from "../../src/lib/prisma";
import * as A from "../../src/app/schede-produzione-actions";
import { assicuraModelliPronti } from "../../src/lib/ordini/schede-server";
import { assicuraArticoliLegno } from "../../src/lib/ordini/legno-server";
import { MODELLO_PREDEFINITO, MODELLO_SEEGLASS } from "../../src/lib/ordini/scheda-produzione";
let ok = 0, ko = 0;
const verifica = (c: unknown, m: string, x?: unknown) => { if (c) { ok++; console.log("  ✓", m); } else { ko++; console.log("  ✗", m, x ?? ""); } };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const redir = async (p: Promise<unknown>) => { try { await p; return ""; } catch (e) { return String((e as { digest?: string }).digest ?? e); } };
(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "SchedaProduzioneModello","Documento","RigaOrdine","OrdineFornitore","Rilievo","Commessa","Preventivo","Cliente","Soggetto" CASCADE');
  const u = await prisma.utente.findFirst({ where: { ruolo: "AMMINISTRATORE" } }) ?? await prisma.utente.create({ data: { nome: "Admin", email: "a@a.it", username: "admin", passwordHash: "x", ruolo: "AMMINISTRATORE" } as never });
  (globalThis as { __utente?: unknown }).__utente = u;
  const brand = await prisma.brand.findFirst() ?? await prisma.brand.create({ data: { nome: "P&C", slug: "pc" } as never });
  const forn = await prisma.soggetto.create({ data: { ragioneSociale: "Serramenti Srl", ruoli: ["FORNITORE"] } });
  const cli = await prisma.cliente.create({ data: { nome: "Mario Rossi", brandId: brand.id, responsabileId: u.id } as never });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: u.id } as never });
  const com = await prisma.commessa.create({ data: { numero: 1, anno: 2026, clienteId: cli.id, brandId: brand.id, preventivoId: prev.id, responsabileId: u.id } as never });
  await prisma.rilievo.create({ data: { commessaId: com.id, tecnicoId: u.id, dataOra: new Date(), misure: "Soggiorno L 1200 × H 1400" } });
  const ord = await prisma.ordineFornitore.create({ data: { numero: 7, anno: 2026, fornitoreId: forn.id, commessaId: com.id } as never });
  await prisma.rigaOrdine.create({ data: { ordineFornitoreId: ord.id, descrizione: "Finestra 2 ante", quantita: 2, um: "pz" } as never });

  const r0 = await redir(A.salvaModelloScheda(fd({ nome: "Scheda serramenti", html: MODELLO_PREDEFINITO, fornitoreId: forn.id })));
  const m = await prisma.schedaProduzioneModello.findFirstOrThrow();
  verifica(m.nome === "Scheda serramenti" && m.fornitoreId === forn.id, "modello salvato per il fornitore", r0);
  await redir(A.creaSchedaProduzione(fd({ ordineId: ord.id, modelloId: m.id, campo_misure_definitive: "Soggiorno L 1198 × H 1395 <speciale>", campo_note_produzione: "Bianco RAL 9010" })));
  const d = await prisma.documento.findFirstOrThrow({ where: { entita: "COMMESSA", entitaId: com.id, cartella: "Schede produzione" } });
  const html = d.contenuto.toString("utf-8");
  verifica(d.mime === "text/html" && /7\/2026/.test(html) && html.includes("Serramenti Srl") && html.includes("Mario Rossi") && !html.includes("Via "), "scheda salvata tra i documenti della pratica con il nominativo (niente indirizzo)", html.slice(0, 200));
  verifica(html.includes("Finestra 2 ante") && !html.includes("€"), "tabella del materiale senza prezzi");
  verifica(html.includes("L 1198 × H 1395 &lt;speciale&gt;") && html.includes("Bianco RAL 9010"), "misure definitive e note, protette dall'HTML");
  verifica(html.includes("Soggiorno L 1200 × H 1400"), "misure del rilievo come riferimento");
  verifica(!/\{\{/.test(html), "nessun segnaposto rimasto");
  // modulo con scelte a spunta (SEEGLASS RUN): una scelta singola e una multipla (più valori con lo stesso nome)
  await redir(A.salvaModelloScheda(fd({ nome: "Seeglass", html: MODELLO_SEEGLASS })));
  const ms = await prisma.schedaProduzioneModello.findFirstOrThrow({ where: { nome: "Seeglass" } });
  const f2 = fd({ ordineId: ord.id, modelloId: ms.id, campo_n_vie: "4 vie", campo_larghezza_mm: "4200" });
  f2.append("campo_chiusura", "Serratura CD-4"); f2.append("campo_chiusura", "Maniglia e azionamento");
  await redir(A.creaSchedaProduzione(f2));
  const d2 = (await prisma.documento.findMany({ where: { entita: "COMMESSA", entitaId: com.id, nome: { contains: "Scheda produzione" } }, orderBy: { createdAt: "desc" } }))[0];
  const h2 = d2.contenuto.toString("utf-8");
  verifica(h2.includes("&#9746; 4 vie") && h2.includes("&#9744; 3 vie"), "scelta singola con le caselle ☒ ☐");
  verifica(h2.includes("&#9746; Serratura CD-4") && h2.includes("&#9746; Maniglia e azionamento") && h2.includes("&#9744; Auto-blocco"), "scelta multipla: più voci spuntate");
  await redir(A.eliminaModelloScheda(fd({ id: m.id })));
  verifica((await prisma.schedaProduzioneModello.count()) === 1 && (await prisma.documento.count()) === 2, "eliminando il modello restano le schede già create");
  // moduli pronti creati da soli una volta (richiesta di Ugo 20/11/2026)
  await prisma.$executeRawUnsafe('TRUNCATE "SchedaProduzioneModello" CASCADE');
  await prisma.configurazione.deleteMany({ where: { chiave: "schede_pronte_versione" } });
  const creati = await assicuraModelliPronti();
  const nomi = (await prisma.schedaProduzioneModello.findMany({ select: { nome: true } })).map((x) => x.nome);
  verifica(creati === 5 && nomi.some((n) => n.includes("angolari in alluminio")) && nomi.some((n) => n.includes("legno piallato")) && nomi.some((n) => n.includes("NEW LIPARI")) && nomi.some((n) => n.includes("SEEGLASS")), "i moduli pronti (standard, NEW LIPARI, SEEGLASS, legno piallato) compaiono da soli", nomi);
  await prisma.schedaProduzioneModello.deleteMany({ where: { nome: { contains: "SEEGLASS" } } });
  verifica((await assicuraModelliPronti()) === 0 && (await prisma.schedaProduzioneModello.count()) === 4, "una volta sola: un modello tolto a mano non torna");
  // produzione già alla versione 1 (senza legno): al rilascio arriva solo il modulo nuovo, il SEEGLASS tolto non torna
  await prisma.schedaProduzioneModello.deleteMany({ where: { nome: { contains: "legno piallato" } } });
  await prisma.configurazione.update({ where: { chiave: "schede_pronte_versione" }, data: { valore: "1" } });
  await prisma.schedaProduzioneModello.deleteMany({ where: { nome: { contains: "angolari in alluminio" } } });
  const agg = await assicuraModelliPronti();
  const dopo = (await prisma.schedaProduzioneModello.findMany({ select: { nome: true } })).map((x) => x.nome);
  verifica(agg === 2 && dopo.some((n) => n.includes("legno piallato")) && dopo.some((n) => n.includes("angolari in alluminio")) && !dopo.some((n) => n.includes("SEEGLASS")), "aggiornamento dalla versione 1: arrivano solo legno e angolari", dopo);
  // legno piallato collegato agli articoli e alle righe dell'ordine (richiesta di Ugo 20/11/2026)
  await prisma.articolo.deleteMany({ where: { codice: { startsWith: "LEGNO-" } } });
  await prisma.configurazione.deleteMany({ where: { chiave: "legno_articoli_versione" } });
  verifica((await assicuraArticoliLegno()) === 26 && (await assicuraArticoliLegno()) === 0, "26 articoli «Legni piallati» creati una volta sola");
  const art = await prisma.articolo.findUnique({ where: { codice: "LEGNO-30X50-3000" }, include: { categoria: { include: { padre: true } } } });
  verifica(art?.categoria?.nome === "Legni piallati" && art.categoria.famiglia === "OUTDOOR" && art.categoria.gruppoListino === "LEGNI PIALLATI" && art.categoria.padre?.nome === "Complementi vetrate" && art.categoria.padre.gruppoListino === "VETRATE" && art.costoAcquisto === 4.05 && art.prezzoVendita === 8.1, "articolo in Complementi vetrate › Legni piallati con costo sullo sviluppo", art);
  const ml = (await prisma.schedaProduzioneModello.findFirst({ where: { nome: { contains: "legno piallato" } } }))!;
  const ordL = await prisma.ordineFornitore.create({ data: { numero: 77, anno: 2026, fornitoreId: (await prisma.soggetto.findFirstOrThrow()).id, commessaId: (await prisma.commessa.findFirst())?.id } });
  await prisma.rigaOrdine.create({ data: { ordineFornitoreId: ordL.id, descrizione: "Altro materiale", quantita: 1, codice: "X1" } });
  const rL = await redir(A.salvaLegnoInOrdine(fd({ ordineId: ordL.id, modelloId: ml.id, campo_tab_legno_1_pezzi: "10", campo_tab_legno_26_pezzi: "4", campo_tab_legno_26_lunghezza: "2500", campo_prezzo_m3: "850" })));
  const righeL = await prisma.rigaOrdine.findMany({ where: { ordineFornitoreId: ordL.id, codice: { startsWith: "LEGNO-" } }, orderBy: { codice: "asc" } });
  verifica(righeL.length === 2 && righeL[0].quantita === 10 && righeL[0].prezzoAcquisto === 3.83 && !!righeL[0].articoloId && righeL[1].codice === "LEGNO-50X170-2500", "salva il legno: una riga per misura con prezzo a barra e articolo", righeL);
  verifica(decodeURIComponent(rL.replace(/\+/g, " ")).includes("totale 110,54"), "messaggio con il totale dei legni", rL);
  await redir(A.salvaLegnoInOrdine(fd({ ordineId: ordL.id, modelloId: ml.id, campo_tab_legno_14_pezzi: "6" })));
  const dopoL = await prisma.rigaOrdine.findMany({ where: { ordineFornitoreId: ordL.id } });
  verifica(dopoL.length === 2 && dopoL.some((r) => r.codice === "X1") && dopoL.some((r) => r.codice === "LEGNO-50X50-3000" && r.quantita === 6 && r.prezzoAcquisto === 6.75), "risalvando le righe del legno si sostituiscono, le altre restano (prezzo indicativo senza concordato)", dopoL);
  const schedeL = await prisma.documento.findMany({ where: { cartella: "Schede produzione", nome: { contains: "77-2026" } } });
  verifica(schedeL.length === 1 && schedeL[0].contenuto.toString("utf-8").includes("50 × 50 × 3000"), "la scheda per il fornitore si aggiorna (una sola, niente doppioni)", schedeL.map((d) => d.nome));
  // angolari in alluminio per i legni (richiesta di Ugo 20/11/2026)
  const ma = (await prisma.schedaProduzioneModello.findFirst({ where: { nome: { contains: "angolari in alluminio" } } }))!;
  const rA = await redir(A.salvaAngolariInOrdine(fd({ ordineId: ordL.id, modelloId: ma.id, campo_tab_ang_1_forma: "L", campo_tab_ang_1_a: "30", campo_tab_ang_1_b: "50", campo_tab_ang_1_spessore: "1.5", campo_tab_ang_1_bello: "EST", campo_tab_ang_1_colore: "0", campo_tab_ang_1_lunghezza: "3000", campo_tab_ang_1_pezzi: "4", campo_tab_ang_2_pezzi: "2", campo_tab_ang_2_forma: "U", campo_tab_ang_2_a: "20" })));
  const righeA = await prisma.rigaOrdine.findMany({ where: { ordineFornitoreId: ordL.id, codice: { startsWith: "ANGALL-" } } });
  verifica(righeA.length === 1 && righeA[0].codice === "ANGALL-L-30X50X0-15-EST-C0-3000-ME" && righeA[0].quantita === 4 && righeA[0].prezzoAcquisto === 13.35, "salva gli angolari: riga con codice e costo di Il Mastro a barra (la U senza lati è scartata)", righeA);
  verifica(decodeURIComponent(rA.replace(/\+/g, " ")).includes("costo 53,40"), "messaggio con il costo degli angolari", rA);
  verifica((await prisma.rigaOrdine.count({ where: { ordineFornitoreId: ordL.id, codice: { startsWith: "LEGNO-" } } })) === 1, "le righe del legno restano");
  // vendita e rilievo (richiesta di Ugo 20/11/2026): angolare nell'offerta al prezzo di vendita, al rilievo come materiale aggiuntivo al costo
  const { aggiungiAngolarePreventivo } = await import("../../src/app/actions");
  const { aggiungiComplemento } = await import("../../src/app/commesse-actions");
  const comm = (await prisma.commessa.findFirst({ include: { preventivo: true } }))!;
  if (comm.preventivo.confermatoIl) await prisma.preventivo.update({ where: { id: comm.preventivoId }, data: { confermatoIl: null } });
  await redir(aggiungiAngolarePreventivo(fd({ preventivoId: comm.preventivoId, codiceAngolare: "ANGALL-L-30X50X0-15-EST-C0-3000-ME", quantita: "3", notaAngolare: "tagli a 45°" })));
  const rp = await prisma.rigaPreventivo.findFirst({ where: { preventivoId: comm.preventivoId, testoLibero: { contains: "Angolare a L" } } });
  verifica(rp?.quantita === 3 && rp.prezzoUnitario === 26.7 && !!rp.testoLibero?.includes("tagli a 45°"), "offerta: angolare su misura al prezzo di vendita (costo × 2)", rp);
  await redir(aggiungiAngolarePreventivo(fd({ preventivoId: comm.preventivoId, codiceAngolare: "ANGALL-FALSO" })));
  verifica((await prisma.rigaPreventivo.count({ where: { preventivoId: comm.preventivoId, testoLibero: { contains: "Angolare" } } })) === 1, "offerta: codice non valido rifiutato");
  const mastro = await prisma.soggetto.create({ data: { ragioneSociale: "IL MASTRO srls", ruoli: ["FORNITORE"] } });
  await redir(aggiungiComplemento(fd({ commessaId: comm.id, tipo: "ANG", codice: "ANGALL-U-20X50X20-10-ENTRAMBI-C6-2000-ME", quantita: "2" })));
  const rc = await prisma.rigaOrdine.findFirst({ where: { commessaId: comm.id, codice: "ANGALL-U-20X50X20-10-ENTRAMBI-C6-2000-ME" } });
  verifica(rc?.complemento === true && rc.fornitoreId === mastro.id && rc.quantita === 2 && rc.prezzoAcquisto === 7.6 && rc.descrizione.includes("Profilo a U"), "rilievo: angolare aggiunto al materiale con costo di Il Mastro e fornitore Il Mastro", rc);
  // nota e file del disegno (dal modulo del rilievo il complemento arriva come JSON con l'allegato)
  const { caricaRilievo } = await import("../../src/app/commesse-actions");
  const ril = await prisma.rilievo.create({ data: { commessaId: comm.id, tecnicoId: u.id, dataOra: new Date(), stato: "PROGRAMMATO" } });
  const pdf = "data:application/pdf;base64," + Buffer.from("%PDF-1.4 disegno").toString("base64");
  await redir(caricaRilievo(fd({ rilievoId: ril.id, misure: "ok", complementi: JSON.stringify([{ tipo: "ANG", codice: "ANGALL-PUNTA-40X40X15-10-EST-C0-3000-MI-G120", quantita: "3", note: "sopra il traverso", allegato: { nome: "disegno.pdf", dataUri: pdf } }]) })));
  const rcp = await prisma.rigaOrdine.findFirst({ where: { commessaId: comm.id, codice: { contains: "PUNTA" } } });
  const docP = await prisma.documento.findFirst({ where: { entitaId: comm.id, cartella: "Rilievi misura", nome: { contains: "disegno.pdf" } } });
  verifica(!!rcp && rcp.descrizione.includes("Copertina a punta") && !!rcp.note?.includes("sopra il traverso") && !!rcp.note?.includes("📎") && docP?.mime === "application/pdf", "rilievo: copertina a punta con nota e file del disegno nella cartella «Rilievi misura»", { rcp, docP: docP?.nome });
  // legno su misura (Ugo 20/11/2026): offerta, rilievo e modulo dell'ordine con misure libere
  const { aggiungiLegnoPreventivo } = await import("../../src/app/actions");
  await redir(aggiungiLegnoPreventivo(fd({ preventivoId: comm.preventivoId, codiceLegno: "LEGNO-35X75-2400", quantita: "4", notaLegno: "larice" })));
  const rl = await prisma.rigaPreventivo.findFirst({ where: { preventivoId: comm.preventivoId, testoLibero: { contains: "35 × 75 × 2400" } } });
  verifica(rl?.quantita === 4 && rl.prezzoUnitario === 11.34 && !!rl.testoLibero?.includes("larice"), "offerta: legno su misura al prezzo di vendita sullo sviluppo", rl);
  await redir(aggiungiComplemento(fd({ commessaId: comm.id, tipo: "LEG", codice: "LEGNO-35X75-2400", quantita: "4" })));
  await redir(aggiungiComplemento(fd({ commessaId: comm.id, tipo: "LEG", codice: "LEGNO-30X50-3000", quantita: "2" })));
  const rlg = await prisma.rigaOrdine.findMany({ where: { commessaId: comm.id, codice: { in: ["LEGNO-35X75-2400", "LEGNO-30X50-3000"] }, ordineFornitoreId: null } });
  verifica(rlg.length === 2 && rlg.some((r) => r.codice === "LEGNO-35X75-2400" && r.prezzoAcquisto === 5.67 && !r.articoloId) && rlg.some((r) => r.codice === "LEGNO-30X50-3000" && !!r.articoloId), "rilievo: legno su misura al costo (e collegato all'articolo se è una misura standard)", rlg);
  const rLib = await redir(A.salvaLegnoInOrdine(fd({ ordineId: ordL.id, modelloId: ml.id, campo_tab_legno_1_pezzi: "2", campo_tab_legnol_1_spessore: "35", campo_tab_legnol_1_larghezza: "75", campo_tab_legnol_1_lunghezza: "2400", campo_tab_legnol_1_pezzi: "4", campo_prezzo_m3: "900" })));
  const libere = await prisma.rigaOrdine.findMany({ where: { ordineFornitoreId: ordL.id, codice: { startsWith: "LEGNO-" } } });
  verifica(libere.length === 2 && libere.some((r) => r.codice === "LEGNO-35X75-2400" && r.quantita === 4 && r.prezzoAcquisto === 5.67), "ordine: misure libere salvate nelle righe del legno", { libere, rLib });
  console.log("Modulo del fornitore al «Carica rilievo» (senza ordine)");
  await prisma.rigaOrdine.deleteMany({ where: { commessaId: com.id, ordineFornitoreId: null } });
  const mr = (await prisma.schedaProduzioneModello.findFirst({ where: { nome: "Scheda serramenti" } })) ?? (await prisma.schedaProduzioneModello.create({ data: { nome: "Scheda serramenti", html: MODELLO_PREDEFINITO, fornitoreId: forn.id } }));
  const rpr = await redir(A.creaSchedaDaRilievo(fd({ commessaId: com.id, modelloId: mr.id, campo_misure_definitive: "Cucina L 900 × H 1200", campo_note_produzione: "Antracite" })));
  console.log("   redirect:", rpr, (await prisma.documento.findMany({ where: { entitaId: com.id }, select: { nome: true } })).map((x) => x.nome));
  const dp = await prisma.documento.findFirstOrThrow({ where: { entita: "COMMESSA", entitaId: com.id, cartella: "Schede produzione", nome: { contains: "Serramenti Srl - 1-2026" } } });
  const hp = dp.contenuto.toString("utf-8");
  verifica(rpr.includes("modulo-fornitore") && hp.includes("Cucina L 900 × H 1200") && hp.includes("Mario Rossi") && hp.includes("Serramenti Srl") && !/\{\{/.test(hp), "scheda compilata al rilievo, senza ordine");
  await A.creaSchedaDaRilievo(fd({ commessaId: com.id, modelloId: mr.id, campo_misure_definitive: "Cucina L 910 × H 1200" })).catch(() => undefined);
  verifica((await prisma.documento.count({ where: { entita: "COMMESSA", entitaId: com.id, nome: { contains: "Serramenti Srl - 1-2026" } } })) === 1, "risalvando si sostituisce, niente doppioni");
  const rlp = await redir(A.salvaLegnoInPratica(fd({ commessaId: com.id, modelloId: ml.id, campo_tab_legno_1_pezzi: "10", campo_tab_legno_26_pezzi: "4", campo_tab_legno_26_lunghezza: "2500", campo_prezzo_m3: "850" })));
  const lp = await prisma.rigaOrdine.findMany({ where: { commessaId: com.id, ordineFornitoreId: null, codice: { startsWith: "LEGNO-" } } });
  verifica(lp.length === 2 && lp.every((r) => r.complemento && (r.costoPrevisto ?? 0) > 0), "legno nel materiale della pratica (non ancora in un ordine) con costo previsto", { lp, rlp });
  await A.salvaLegnoInPratica(fd({ commessaId: com.id, modelloId: ml.id, campo_tab_legno_14_pezzi: "6" })).catch(() => undefined);
  verifica((await prisma.rigaOrdine.count({ where: { commessaId: com.id, ordineFornitoreId: null, codice: { startsWith: "LEGNO-" } } })) === 1, "risalvando il legno si riscrive, niente doppioni");
  const mastroP = (await prisma.soggetto.findFirst({ where: { ragioneSociale: { contains: "mastro", mode: "insensitive" } } })) ?? (await prisma.soggetto.create({ data: { ragioneSociale: "IL MASTRO SRLS", ruoli: ["FORNITORE"] } }));
  await A.salvaAngolariInPratica(fd({ commessaId: com.id, modelloId: ml.id, campo_tab_ang_1_forma: "L", campo_tab_ang_1_a: "30", campo_tab_ang_1_b: "50", campo_tab_ang_1_spessore: "15", campo_tab_ang_1_bello: "EST", campo_tab_ang_1_colore: "0", campo_tab_ang_1_lunghezza: "3000", campo_tab_ang_1_pezzi: "2" })).catch(() => undefined);
  const ap = await prisma.rigaOrdine.findMany({ where: { commessaId: com.id, ordineFornitoreId: null, codice: { startsWith: "ANGALL-" } } });
  verifica(ap.length === 1 && ap[0].quantita === 2 && ap[0].fornitoreId === mastroP.id && (ap[0].costoPrevisto ?? 0) > 0, "angolari nel materiale della pratica, fornitore Il Mastro", ap);

  console.log("La tabella del materiale ha solo i prodotti del fornitore del modulo");
  const c3 = await prisma.soggetto.create({ data: { ragioneSociale: "C3 SYSTEMS", ruoli: ["FORNITORE"] } });
  await prisma.rigaOrdine.deleteMany({ where: { commessaId: com.id, ordineFornitoreId: null } });
  await prisma.rigaOrdine.createMany({ data: [
    { commessaId: com.id, descrizione: "VETRATA SCINTILLA 390x300", quantita: 1, fornitoreId: c3.id, fornitoreNome: "C3 SYSTEMS" },
    { commessaId: com.id, descrizione: "Angolare L in alluminio", quantita: 1, codice: "ANGALL-L-32X102X0-15-EST-C6-3500-MI", complemento: true, fornitoreId: null },
    { commessaId: com.id, descrizione: "Legno piallato 50×100", quantita: 1, codice: "LEGNO-50X100-3500", complemento: true, fornitoreId: null },
    { commessaId: com.id, descrizione: "Altro prodotto di un altro fornitore", quantita: 1, fornitoreId: forn.id, fornitoreNome: "Serramenti Srl" },
  ] as never });
  const msg2 = (await prisma.schedaProduzioneModello.findFirst({ where: { nome: "Seeglass" } })) ?? (await prisma.schedaProduzioneModello.create({ data: { nome: "Seeglass", html: MODELLO_SEEGLASS } }));
  console.log("   ", await redir(A.creaSchedaDaRilievo(fd({ commessaId: com.id, modelloId: msg2.id, fornitoreId: c3.id }))));
  const dSg = await prisma.documento.findFirstOrThrow({ where: { entita: "COMMESSA", entitaId: com.id, nome: { contains: "C3 SYSTEMS" } } });
  const hSg = dSg.contenuto.toString("utf-8");
  verifica(hSg.includes("VETRATA SCINTILLA") && !hSg.includes("Angolare") && !hSg.includes("Legno piallato") && !hSg.includes("Altro prodotto"), "solo la vetrata del fornitore: niente angolari, legni o prodotti di altri fornitori");
  await redir(A.creaSchedaDaRilievo(fd({ commessaId: com.id, modelloId: msg2.id })));
  const dVuoto = await prisma.documento.findMany({ where: { entita: "COMMESSA", entitaId: com.id, nome: { contains: "Seeglass" } } });
  verifica(dVuoto.every((d) => !d.contenuto.toString("utf-8").includes("Angolare")), "senza fornitore scelto la tabella non pesca prodotti a caso");

  console.log("Chi può compilare il modulo al rilievo");
  const adminU = (globalThis as { __utente?: unknown }).__utente;
  const sfx = String(Date.now());
  const commU = await prisma.utente.create({ data: { nome: "Commerciale", email: `c${sfx}@c.it`, username: `comm${sfx}`, passwordHash: "x", ruolo: "COMMERCIALE" } as never });
  (globalThis as { __utente?: unknown }).__utente = commU;
  const rifiuto = await A.creaSchedaDaRilievo(fd({ commessaId: com.id, modelloId: mr.id })).then(() => "", (e) => String(e));
  verifica(rifiuto.includes("Non autorizzato"), "un commerciale non compila il modulo del fornitore", rifiuto);
  const tecU = await prisma.utente.create({ data: { nome: "Tecnico", email: `t${sfx}@t.it`, username: `tec${sfx}`, passwordHash: "x", ruolo: "TECNICO" } as never });
  await prisma.rilievo.create({ data: { commessaId: com.id, tecnicoId: tecU.id, dataOra: new Date() } });
  (globalThis as { __utente?: unknown }).__utente = tecU;
  const okTec = await redir(A.creaSchedaDaRilievo(fd({ commessaId: com.id, modelloId: mr.id, campo_misure_definitive: "x" })));
  verifica(okTec.includes("okScheda"), "il tecnico del rilievo sì", okTec);
  (globalThis as { __utente?: unknown }).__utente = adminU;

  console.log(`\n${ok} controlli superati, ${ko} falliti`);
  process.exit(ko ? 1 : 0);
})();
