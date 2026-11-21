// Collaudo: rilievo con PDF, complementi «solo acquisto» (articolo, listino, testo libero) e costo dalla conferma del fornitore
// sostituito poi dalla fattura.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/rilievo-complementi.collaudo.ts
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import * as C from "../../src/app/commesse-actions";
import * as O from "../../src/app/ordini-actions";
import { GET as cerca } from "../../src/app/api/complementi/route";
import { costiMaterialeCommesse } from "../../src/lib/ordini/server";
import { costiCommesse } from "../../src/lib/amministrazione/analisi";
import { registraFattura } from "../../src/lib/fatture/server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; if (!d.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(d.split(";")[2] ?? ""); } };
const materiale = async (id: string) => (await costiMaterialeCommesse([id])).get(id)!;
const somma = (v: { importo: number }[]) => Math.round(v.reduce((t, x) => t + x.importo, 0) * 100) / 100;

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "Documento","OrdineFornitore","RigaOrdine","CommessaEvento","Commessa","Preventivo","Cliente","Soggetto","Utente","Brand","Rilievo","RilievoAllegato","Articolo","ModelloProdotto","Prodotto","FatturaAcquisto","CostoManuale","Scadenza" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@prova.it", ruolo: "AMMINISTRATORE" } });
  const mastro = await prisma.soggetto.create({ data: { ragioneSociale: "IL MASTRO SRLS", ruoli: ["FORNITORE"], scontoFornitore: 50 } });
  const ferr = await prisma.soggetto.create({ data: { ragioneSociale: "FERRAMENTA SPA", ruoli: ["FORNITORE"] } });
  const cli = await prisma.cliente.create({ data: { nome: "GERBAUDO PIERANGELA", brandId: brand.id } });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: ugo.id, oggetto: "Serramenti", totaleNetto: 5000 } });
  const c = await prisma.commessa.create({ data: { numero: 9, anno: 2026, preventivoId: prev.id, clienteId: cli.id, brandId: brand.id } });
  const art = await prisma.articolo.create({ data: { codice: "SIL-01", descrizione: "Silicone neutro bianco", fornitoreId: ferr.id, costoAcquisto: 6.5, um: "pz" } });
  await prisma.modelloProdotto.create({ data: { brandId: brand.id, tipologia: "SCOSSALINA_PROVA", gruppo: "LATTONERIA", fornitoreId: mastro.id } });
  await prisma.prodotto.createMany({ data: [
    { brandId: brand.id, tipologia: "SCOSSALINA_PROVA", colore: "Bianco", larghezzaMm: 1000, altezzaMm: 0, prezzoBase: 40 },
    { brandId: brand.id, tipologia: "SCOSSALINA_PROVA", colore: "Bianco", larghezzaMm: 2000, altezzaMm: 0, prezzoBase: 70 },
    { brandId: brand.id, tipologia: "SCOSSALINA_PROVA", colore: "Marrone", larghezzaMm: 2000, altezzaMm: 0, prezzoBase: 80 },
  ] });
  const ril = await prisma.rilievo.create({ data: { commessaId: c.id, tecnicoId: ugo.id, dataOra: new Date() } });
  g.__utente = ugo;

  console.log("1. Rilievo con foto e PDF");
  const pdf = `data:application/pdf;base64,${Buffer.from("%PDF-1.4 prova").toString("base64")}`;
  await dove(C.caricaRilievo(fd({ rilievoId: ril.id, misure: "Soggiorno L 1200 × H 1400", foto: JSON.stringify([{ nome: "rilievo.pdf", dataUri: pdf }, { nome: "foto.jpg", dataUri: "data:image/jpeg;base64,AAAA" }]) })));
  const all = await prisma.rilievoAllegato.findMany({ where: { rilievoId: ril.id } });
  verifica(all.length === 2 && all.some((a) => a.nome === "rilievo.pdf" && a.dataUri.startsWith("data:application/pdf")), "PDF e foto salvati nel rilievo", all.map((a) => a.nome));
  verifica((await prisma.rilievo.findUniqueOrThrow({ where: { id: ril.id } })).stato === "ESEGUITO", "rilievo eseguito");

  const cartellaPdf = await prisma.documento.findFirst({ where: { entita: "COMMESSA", entitaId: ril.commessaId, cartella: "Rilievi misura", nome: "rilievo.pdf" } });
  const cartellaFoto = await prisma.documento.findFirst({ where: { entita: "COMMESSA", entitaId: ril.commessaId, cartella: "Foto rilievi", nome: "foto.jpg" } });
  verifica(!!cartellaPdf && cartellaPdf.mime === "application/pdf", "il PDF del rilievo è anche nella cartella «Rilievi misura» della pratica", cartellaPdf?.nome);
  verifica(!!cartellaFoto, "la foto è nella cartella «Foto rilievi»");
  // verbale di sopralluogo compilato al passo 2 del «Carica rilievo»
  const fv = fd({ rilievoId: ril.id, misure: "Soggiorno L 1200 × H 1400", v_piano: "2", v_note_stato: "Crepa in cucina", vr_1_tipo: "Finestra cucina", vr_1_larg: "1200", vr_1_alt: "1400", vr_1_q: "2", v_rif_interno: "Mario" });
  fv.append("v_intervento", "Serramenti PVC"); fv.append("v_intervento", "Tapparelle"); fv.append("v_intervento", "Inventata");
  const dvv = await dove(C.caricaRilievo(fv));
  const rv = (await prisma.rilievo.findUniqueOrThrow({ where: { id: ril.id } })).verbale as { campi: Record<string, unknown>; righe: { tipo: string }[]; rif_interno?: string } | null;
  {
    verifica(!!rv && JSON.stringify(rv.campi.intervento) === JSON.stringify(["Serramenti PVC", "Tapparelle"]) && rv.campi.piano === "2" && rv.righe[0]?.tipo === "Finestra cucina" && rv.rif_interno === "Mario", "verbale salvato nel rilievo (spunte, testi, prodotti)", rv);
    verifica(!!dvv && dvv.includes(`carica=${ril.id}`) && dvv.includes("salvato=1"), "dopo il salvataggio si torna alla schermata del rilievo", dvv);
  }
  // senza verbale compilato il campo si svuota
  await dove(C.caricaRilievo(fd({ rilievoId: ril.id, misure: "Soggiorno L 1200 × H 1400" })));
  verifica((await prisma.rilievo.findUniqueOrThrow({ where: { id: ril.id } })).verbale === null, "verbale vuoto = nessun dato salvato");

  console.log("1b. Colori MV Living sui componenti struttura (COMPSFUSI)");
  await prisma.prodotto.createMany({ data: [{ brandId: brand.id, tipologia: "COMPSFUSI_PROFILO_M", colore: "STANDARD", altezzaMm: 0, larghezzaMm: 4000, prezzoBase: 100, coefficienteRicarico: 1 }, { brandId: brand.id, tipologia: "COMPSFUSI_PROFILO_M", colore: "STANDARD", altezzaMm: 0, larghezzaMm: 5000, prezzoBase: 125, coefficienteRicarico: 1 }] });
  await prisma.modelloProdotto.upsert({ where: { brandId_tipologia: { brandId: brand.id, tipologia: "COMPSFUSI_PROFILO_M" } }, create: { brandId: brand.id, tipologia: "COMPSFUSI_PROFILO_M", famiglia: "OUTDOOR", gruppo: "COMPONENTI STRUTTURA" }, update: {} });
  await prisma.configurazione.deleteMany({ where: { chiave: "compsfusi_colori_versione" } });
  const rcMv = await (await cerca(new NextRequest(`http://x/api/complementi?tipologia=COMPSFUSI_PROFILO_M&brandId=${brand.id}`))).json();
  const colori: string[] = rcMv.risultati?.[0]?.colori ?? [];
  verifica(colori.length >= 8 && colori.some((c) => c.includes("7016")) && colori.includes("Corten") && colori.includes("STANDARD"), "il profilo ha i colori MV Living nella tendina (e lo STANDARD di prima)", colori);
  const prezzi = await prisma.prodotto.findMany({ where: { tipologia: "COMPSFUSI_PROFILO_M", larghezzaMm: 5000 }, select: { prezzoBase: true } });
  verifica(prezzi.length === 8 && prezzi.every((x) => x.prezzoBase === 125), "stesso prezzo a misura per ogni colore", prezzi);
  await cerca(new NextRequest(`http://x/api/complementi?tipologia=COMPSFUSI_PROFILO_M&brandId=${brand.id}`));
  verifica((await prisma.prodotto.count({ where: { tipologia: "COMPSFUSI_PROFILO_M" } })) === 16, "richiamato più volte non duplica");
  await prisma.prodotto.deleteMany({ where: { tipologia: "COMPSFUSI_PROFILO_M" } });
  await prisma.modelloProdotto.deleteMany({ where: { tipologia: "COMPSFUSI_PROFILO_M" } });

  console.log("2. Ricerca nel listino e negli articoli");
  const r1 = await (await cerca(new NextRequest("http://x/api/complementi?q=scossalina"))).json();
  const p = r1.risultati.find((x: { tipo: string }) => x.tipo === "P");
  verifica(p && p.colori.length === 2 && p.griglia === true && p.fornitoreId === mastro.id, "trovata la scossalina con 2 colori, a misura, fornitore del listino", r1);
  const r2 = await (await cerca(new NextRequest("http://x/api/complementi?q=silicone bianco"))).json();
  verifica(r2.risultati.some((x: { tipo: string; id: string }) => x.tipo === "A" && x.id === art.id), "trovato l'articolo cercando due parole", r2);

  console.log("3. Complementi: listino, articolo, testo libero");
  const totPrima = (await prisma.preventivo.findUniqueOrThrow({ where: { id: prev.id } })).totaleNetto;
  const d1 = await dove(C.aggiungiComplemento(fd({ commessaId: c.id, tipo: "P", brandId: brand.id, tipologia: "SCOSSALINA_PROVA", colore: "Bianco", larghezza: "1500", quantita: "3", descrizione: "Scossalina" })));
  const sc = await prisma.rigaOrdine.findFirstOrThrow({ where: { commessaId: c.id, descrizione: { contains: "Scossalina" } } });
  verifica(sc.complemento && sc.rigaPreventivoId === null && sc.fornitoreId === mastro.id && sc.prezzoAcquisto === 70, "scossalina 1500: fascia 2000 del listino, fornitore Il Mastro", sc);
  verifica(sc.costoPrevisto === 105 && sc.descrizione.includes("Bianco") && sc.descrizione.includes("1500"), "costo previsto 70 × 3 − 50% = 105, colore e misura nella descrizione", sc);
  verifica(d1 === `/commesse/${c.id}#materiale-pratica`, "si torna al materiale della pratica", d1);
  await dove(C.aggiungiComplemento(fd({ commessaId: c.id, tipo: "A", articoloId: art.id, quantita: "4" })));
  const si = await prisma.rigaOrdine.findFirstOrThrow({ where: { commessaId: c.id, articoloId: art.id } });
  verifica(si.complemento && si.costoPrevisto === 26 && si.fornitoreId === ferr.id && si.codice === "SIL-01", "articolo: costo 6,50 × 4 = 26, fornitore dell'anagrafica", si);
  await dove(C.aggiungiComplemento(fd({ commessaId: c.id, tipo: "T", descrizione: "Coprifilo 70 mm noce", quantita: "2", fornitoreId: mastro.id, note: "lato bagno" })));
  const cf = await prisma.rigaOrdine.findFirstOrThrow({ where: { commessaId: c.id, descrizione: "Coprifilo 70 mm noce" } });
  verifica(cf.complemento && cf.fornitoreId === mastro.id && cf.costoPrevisto === null && cf.note === "lato bagno", "testo libero con fornitore scelto a mano", cf);
  const fuori = await dove(C.aggiungiComplemento(fd({ commessaId: c.id, tipo: "P", brandId: brand.id, tipologia: "SCOSSALINA_PROVA", colore: "Bianco", larghezza: "3000" })));
  verifica(fuori?.includes("avviso=") && fuori.includes("fuori"), "misura fuori listino: messaggio, nessuna riga", fuori);
  verifica(await prisma.rigaOrdine.count({ where: { commessaId: c.id } }) === 3, "tre complementi");
  verifica((await prisma.preventivo.findUniqueOrThrow({ where: { id: prev.id } })).totaleNetto === totPrima, "la vendita al cliente non cambia");

  console.log("4. Togli un complemento");
  await C.eliminaComplemento(fd({ rigaId: cf.id }));
  verifica(!(await prisma.rigaOrdine.findUnique({ where: { id: cf.id } })), "complemento tolto");

  console.log("4b. Angolari e legni dal listino della pratica (solo acquisto)");
  const ang = await dove(C.complementoAngolareDaListino(fd({ preventivoId: c.id, codiceAngolare: "ANGALL-L-30X50X0-15-EST-C0-3000-ME", quantita: "2", notaAngolare: "gronda nord" })));
  const ra = await prisma.rigaOrdine.findFirstOrThrow({ where: { commessaId: c.id, codice: { startsWith: "ANGALL-" } } });
  verifica(ra.complemento && ra.quantita === 2 && (ra.costoPrevisto ?? 0) > 0 && ra.note === "gronda nord" && ra.fornitoreId === mastro.id, "angolare dal listino: complemento al costo, fornitore Il Mastro", { ra, ang });
  await dove(C.complementoLegnoDaListino(fd({ preventivoId: c.id, codiceLegno: "LEGNO-30X70-2500", quantita: "3", notaLegno: "pilastri" })));
  const rl = await prisma.rigaOrdine.findFirstOrThrow({ where: { commessaId: c.id, codice: "LEGNO-30X70-2500" } });
  verifica(rl.complemento && rl.quantita === 3 && (rl.costoPrevisto ?? 0) > 0 && rl.note === "pilastri", "legno su misura dal listino: complemento con costo", rl);
  await prisma.rigaOrdine.deleteMany({ where: { id: { in: [ra.id, rl.id] } } });
  verifica((await prisma.preventivo.findUniqueOrThrow({ where: { id: prev.id } })).totaleNetto === totPrima, "la vendita al cliente non cambia");

  console.log("5. Ordine al fornitore e totale confermato");
  await dove(O.creaOrdineDaCommessa(fd({ commessaId: c.id, fornitoreId: mastro.id })));
  const ord = await prisma.ordineFornitore.findFirstOrThrow({ where: { fornitoreId: mastro.id }, include: { righe: true } });
  verifica(ord.righe.length === 1 && ord.righe[0].id === sc.id, "la scossalina va nell'ordine a Il Mastro");
  await dove(O.segnaOrdineInviatoAMano(fd({ id: ord.id, a: "portale" })));
  await prisma.rigaOrdine.update({ where: { id: si.id }, data: { costoEffettivo: 24 } });
  let m = await materiale(c.id);
  verifica(somma(m.voci) === 24 && m.righeSenzaCosto === 1, "prima della conferma: solo il silicone con costo, scossalina senza costo", m);
  await O.registraConfermaFornitore(fd({ id: ord.id, numeroConfermaFornitore: "C-55", totaleConfermato: "1.250,40" }));
  const conf = await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: ord.id } });
  verifica(conf.totaleConfermato === 1250.4 && conf.stato === "CONFERMATO" && conf.totaleConfermatoDaNome === "Ugo Perottino", "totale confermato 1.250,40 salvato", conf);
  m = await materiale(c.id);
  verifica(somma(m.voci) === 1274.4 && m.righeSenzaCosto === 0 && m.voci.some((v) => v.tipo === "Materiale (conferma fornitore)" && v.voce.includes("IL MASTRO")), "costi commessa: conferma 1.250,40 + silicone 24", m);
  const ev = await prisma.commessaEvento.findFirst({ where: { commessaId: c.id, testo: { contains: "totale confermato" } } });
  verifica(ev, "scritto nella storia della commessa");
  verifica((await costiCommesse([c.id])).get(c.id)?.materiale === 1274.4, "anche i report usano lo stesso costo");

  console.log("5b. Spunta «ricevuto dal fornitore» e file dal computer nell'invio");
  await O.segnaOrdineRicevuto(fd({ id: ord.id, ricevuto: "1" }));
  const rc = await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: ord.id } });
  verifica(rc.ricevutoIl !== null && rc.ricevutoDaNome === "Ugo Perottino", "spunta ricevuto: data e chi", rc);
  await O.segnaOrdineRicevuto(fd({ id: ord.id, ricevuto: "0" }));
  verifica((await prisma.ordineFornitore.findUniqueOrThrow({ where: { id: ord.id } })).ricevutoIl === null, "spunta tolta");
  verifica(!!(await prisma.commessaEvento.findFirst({ where: { commessaId: c.id, testo: { contains: "ha ricevuto l'ordine" } } })), "scritto nella storia della pratica");

  console.log("6. Arriva la fattura: conta la fattura");
  const f = await prisma.fatturaAcquisto.create({ data: { chiave: "F1", fornitoreId: mastro.id, fornitoreNome: "IL MASTRO SRLS", numero: "88", data: new Date("2026-11-20"), imponibile: 1300, totale: 1586, stato: "DA_VERIFICARE",
    righe: { create: [{ descrizione: "Scossaline", importo: 1300, commessaId: c.id }] } } });
  await prisma.$transaction((tx) => registraFattura(tx, f.id, "Giorgia"));
  m = await materiale(c.id);
  const tot = (await costiCommesse([c.id])).get(c.id)!;
  verifica(somma(m.voci) === 24 && !m.voci.some((v) => v.tipo.includes("conferma")), "la conferma non conta più", m);
  verifica(tot.materiale === 24 && tot.altro === 1300 && tot.totale === 1324, "costi: fattura 1.300 + silicone 24, niente doppio conteggio", tot);

  console.log(`\n${ok} ok, ${ko} falliti`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
