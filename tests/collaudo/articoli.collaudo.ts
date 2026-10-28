// Collaudo anagrafica articoli, importazione Excel/CSV, AI (simulata) e collegamento agli ordini, su database di PROVA.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/articoli.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import * as A from "../../src/app/articoli-actions";
import { GET as esporta } from "../../src/app/api/articoli/esporta/route";
import { GET as modello } from "../../src/app/api/articoli/modello/route";
import { POST as ai } from "../../src/app/api/articoli/ai/route";
import { scriviXlsx, leggiFile } from "../../src/lib/articoli/foglio";
import { analizzaListino, contaAnteprima, type Opzioni } from "../../src/lib/articoli/importa";
import { articoliPerConfronto, categorieRegola } from "../../src/lib/articoli/server";
import type { Tabella } from "../../src/lib/articoli/foglio";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string | File | (string | File)[]>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x)); return f; };
const redirectA = async (p: Promise<unknown>): Promise<string | null> => {
  try { await p; return null; } catch (e) {
    const d = (e as { digest?: string }).digest ?? "";
    if (d.startsWith("NEXT_REDIRECT")) return d.split(";")[2] ?? "";
    throw e;
  }
};
const lancia = async (p: Promise<unknown>) => { try { await p; return false; } catch (e) { return !(e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT"); } };
const xlsx = (nome: string, righe: (string | number | null)[][]) => new File([new Uint8Array(scriviXlsx([{ nome: "Listino", righe }]))], nome, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const art = (codice: string) => prisma.articolo.findUnique({ where: { codice }, include: { storico: { orderBy: { createdAt: "asc" } } } });
const anteprima = async (id: string) => {
  const imp = (await prisma.importazioneArticoli.findUnique({ where: { id } }))!;
  const [es, forn, cat] = await Promise.all([articoliPerConfronto(), prisma.soggetto.findMany({ select: { id: true, ragioneSociale: true, scontoFornitore: true } }), categorieRegola()]);
  return analizzaListino(imp.righe as Tabella, imp.opzioni as Opzioni, es, forn, cat);
};

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "StoricoPrezzoArticolo","Articolo","CategoriaArticolo","ImportazioneArticoli","Documento","OrdineFornitore","RigaOrdine","Soggetto","Utente" CASCADE');
  const capo = await prisma.utente.create({ data: { nome: "Ugo", email: "ugo@prova.it", ruolo: "AMMINISTRATORE" } });
  const ammin = await prisma.utente.create({ data: { nome: "Debora", email: "debora@prova.it", ruolo: "AMMINISTRATIVO" } });
  const somfy = await prisma.soggetto.create({ data: { ragioneSociale: "SOMFY ITALIA S.R.L.", ruoli: ["FORNITORE"], scontoFornitore: 50 } });
  const acqua = await prisma.soggetto.create({ data: { ragioneSociale: "ACQUA PURA SPA", ruoli: ["FORNITORE"] } });

  console.log("1. Permessi");
  g.__utente = ammin;
  verifica(await lancia(A.salvaArticolo(null, fd({ descrizione: "x" }))), "un amministrativo non può creare articoli");
  verifica(await lancia(A.salvaCategoria(fd({ nome: "x" }))), "né categorie");
  g.__utente = null;
  verifica((await esporta(new Request("http://x/api/articoli/esporta"))).status === 401, "esportazione senza accesso: rifiutata");

  console.log("2. Categorie e regole");
  g.__utente = capo;
  await redirectA(A.salvaCategoria(fd({ nome: "Pergole", metodoPrezzo: "RICARICO", valore: "3,3", arrotondamento: "1", margineMinimo: "30", divisione: "P&C" })));
  const perg = (await prisma.categoriaArticolo.findFirst({ where: { nome: "Pergole" } }))!;
  await redirectA(A.salvaCategoria(fd({ nome: "Motori", padreId: perg.id })));
  await redirectA(A.salvaCategoria(fd({ nome: "Depurazione", metodoPrezzo: "MARGINE", valore: "40", arrotondamento: "5" })));
  const mot = (await prisma.categoriaArticolo.findFirst({ where: { nome: "Motori" } }))!;
  const dep = (await prisma.categoriaArticolo.findFirst({ where: { nome: "Depurazione" } }))!;
  verifica(perg.valore === 3.3 && mot.padreId === perg.id && dep.metodoPrezzo === "MARGINE", "categorie e sottocategoria create con le regole");
  const dop = await redirectA(A.salvaCategoria(fd({ nome: "pergole " })));
  verifica(dop === null || (await prisma.categoriaArticolo.count({ where: { padreId: null, nome: { equals: "Pergole", mode: "insensitive" } } })) >= 1, "nome doppio gestito");

  console.log("3. Scheda articolo");
  const dest = await redirectA(A.salvaArticolo(null, fd({ descrizione: "Motore Oximo 40", categoriaId: mot.id, fornitoreId: somfy.id, prezzoListino: "245,00", sconti: "50+10", attivo: "1", um: "pz", aliquotaIva: "22" })));
  const m1 = (await prisma.articolo.findFirst({ where: { descrizione: "Motore Oximo 40" }, include: { storico: true } }))!;
  verifica(dest?.startsWith(`/prodotti/articoli/${m1.id}`), "dopo la creazione si apre la scheda", dest);
  verifica(m1.codice === "ART-00001", "codice automatico ART-00001", m1.codice);
  verifica(m1.costoAcquisto === 110.25 && m1.prezzoVendita === 364, "costo 245 −50−10 = 110,25; vendita ×3,3 arrotondata = 364 (regola della madre)", m1);
  verifica(m1.storico.length === 1, "prima voce nello storico prezzi");
  const e2 = await A.salvaArticolo(null, fd({ id: m1.id, codice: "art-00001", descrizione: "Motore Oximo 40 WT", categoriaId: mot.id, fornitoreId: somfy.id, prezzoListino: "260", sconti: "50+10", attivo: "1" }));
  const m1b = (await art("ART-00001"))!;
  verifica(e2?.ok && m1b.prezzoVendita === 387 && m1b.storico.length === 2, "modifica listino: vendita ricalcolata (260×0,45×3,3=386,1→387) e storico", { e2, v: m1b.prezzoVendita });
  await redirectA(A.salvaArticolo(null, fd({ codice: "FLT-10", descrizione: "Cartuccia 10 pollici", categoriaId: dep.id, fornitoreId: acqua.id, costoAcquisto: "6,80", attivo: "1" })));
  const doppio = await A.salvaArticolo(null, fd({ codice: "flt-10", descrizione: "altro", attivo: "1" }));
  verifica(doppio?.ok === false && /già usato/.test(doppio.messaggio), "codice doppio rifiutato", doppio);
  const flt = (await art("FLT-10"))!;
  verifica(flt.prezzoVendita === 15 && flt.costoAcquisto === 6.8, "margine 40%: 6,80/0,6=11,33 → arrotondato a 5 € = 15", flt.prezzoVendita);
  await redirectA(A.salvaArticolo(null, fd({ codice: "MAN-1", descrizione: "Prezzo a mano", categoriaId: perg.id, costoAcquisto: "100", metodoPrezzo: "MANUALE", prezzoVendita: "150", attivo: "1" })));
  const man = await A.salvaArticolo(null, fd({ id: (await art("MAN-1"))!.id, codice: "MAN-1", descrizione: "Prezzo a mano", categoriaId: perg.id, costoAcquisto: "100", metodoPrezzo: "MANUALE", prezzoVendita: "120", attivo: "1" }));
  verifica(man?.ok && /sotto il minimo/.test(man.messaggio), "avviso margine sotto il minimo (20% < 30%)", man);
  const codici = await Promise.all([1, 2, 3].map((i) => redirectA(A.salvaArticolo(null, fd({ descrizione: `Parallelo ${i}`, attivo: "1" })))));
  const par = await prisma.articolo.findMany({ where: { descrizione: { startsWith: "Parallelo" } }, select: { codice: true } });
  verifica(codici.length === 3 && new Set(par.map((p) => p.codice)).size === 3, "3 articoli creati insieme: 3 codici diversi", par);

  console.log("4. Importazione Excel con anteprima e conferma");
  const file = xlsx("listino somfy 2027.xlsx", [
    ["Listino Somfy 2027"], [],
    ["Codice fornitore", "Descrizione", "Categoria", "Sottocategoria", "Prezzo", "Sconto %", "Note"],
    ["SOM-1", "Telecomando Situo 1", "Pergole", "Comandi", 52.5, "", ""],
    ["SOM-2", "Ricevitore radio", "Pergole", "Motori", 80, "40", ""],
    ["SOM-3", "Prezzo sbagliato", "Pergole", "", "abc", "", ""],
    ["SOM-1", "Telecomando doppio", "", "", 10, "", ""],
  ]);
  const imp1 = await redirectA(A.caricaListino(fd({ file, fornitoreId: somfy.id, divisione: "P&C" })));
  const impId = imp1!.split("/").pop()!;
  verifica(imp1?.startsWith("/prodotti/articoli/importa/"), "caricamento → anteprima", imp1);
  verifica((await prisma.articolo.count({ where: { codiceFornitore: { startsWith: "SOM-" } } })) === 0, "nessun articolo creato prima della conferma");
  const an1 = await anteprima(impId);
  const c1 = contaAnteprima(an1.righe);
  verifica(c1.nuovi === 2 && c1.errori === 2, "anteprima: 2 nuovi, 2 errori (numero e doppione)", c1);
  verifica(an1.categorieNuove.join() === "Pergole › Comandi", "sottocategoria nuova segnalata", an1.categorieNuove);
  await redirectA(A.confermaImportazione(fd({ id: impId })));
  const som1 = (await art("SOM-1"))!, som2 = (await art("SOM-2"))!;
  const comandi = await prisma.categoriaArticolo.findFirst({ where: { nome: "Comandi" } });
  verifica(som1 && som1.sconti === "50" && som1.costoAcquisto === 26.25 && som1.prezzoVendita === 87, "SOM-1: codice dal fornitore, sconto del fornitore 50%, vendita ×3,3 della madre = 87", som1);
  verifica(comandi?.padreId === perg.id && som1.categoriaId === comandi?.id, "sottocategoria «Comandi» creata sotto Pergole");
  verifica(som2.sconti === "40" && som2.costoAcquisto === 48 && som2.categoriaId === mot.id, "SOM-2: sconto del file, categoria esistente");
  verifica(som1.storico[0]?.origine === "IMPORTAZIONE", "storico: importazione");
  const imp1db = (await prisma.importazioneArticoli.findUnique({ where: { id: impId } }))!;
  verifica(imp1db.stato === "ESEGUITA" && imp1db.creati === 2 && imp1db.scartati === 2, "importazione segnata come eseguita con i conteggi", imp1db);
  await redirectA(A.confermaImportazione(fd({ id: impId })));
  verifica((await prisma.articolo.count({ where: { codiceFornitore: { startsWith: "SOM-" } } })) === 2, "una seconda conferma non duplica nulla");

  console.log("5. Esporta → modifica → reimporta");
  const r = await esporta(new Request("http://x/api/articoli/esporta?formato=xlsx"));
  const buf = Buffer.from(await r.arrayBuffer());
  const fogli = leggiFile("export.xlsx", buf);
  verifica(r.status === 200 && fogli[0].righe.length === (await prisma.articolo.count({ where: { attivo: true } })) + 1, "esportazione Excel con tutti gli articoli attivi", fogli[0].righe.length);
  const imp2 = (await redirectA(A.caricaListino(fd({ file: new File([new Uint8Array(buf)], "export.xlsx") }))))!.split("/").pop()!;
  const c2 = contaAnteprima((await anteprima(imp2)).righe);
  verifica(c2.invariati === fogli[0].righe.length - 1 && c2.nuovi === 0 && c2.modificati === 0 && c2.errori === 0, "il file esportato e ricaricato senza modifiche risulta tutto «già uguale»", c2);
  const tab = fogli[0].righe.map((x) => [...x]);
  const iCod = tab[0].indexOf("CODICE"), iList = tab[0].indexOf("PREZZO LISTINO");
  const riga = tab.find((x) => x[iCod] === "SOM-2")!;
  riga[iList] = "88";
  const csv = tab.map((x) => x.map((c) => (/[;"]/.test(c ?? "") ? `"${c.replace(/"/g, '""')}"` : c)).join(";")).join("\n");
  const imp3 = (await redirectA(A.caricaListino(fd({ file: new File([csv], "export modificato.csv", { type: "text/csv" }) }))))!.split("/").pop()!;
  const an3 = await anteprima(imp3);
  const mod3 = an3.righe.filter((x) => x.azione === "MODIFICA");
  verifica(mod3.length === 1 && mod3[0].modifiche.some((m) => m.campo === "Listino" && m.prima === "80" && m.dopo === "88"), "CSV con un prezzo cambiato: 1 modifica (listino 80 → 88)", mod3.map((x) => x.modifiche));
  await redirectA(A.confermaImportazione(fd({ id: imp3 })));
  verifica((await art("SOM-2"))!.prezzoVendita === 175, "dopo la conferma: 88×0,6=52,80 ×3,3 = 174,24 → 175", (await art("SOM-2"))!.prezzoVendita);
  await redirectA(A.annullaImportazione(fd({ id: imp2 })));
  verifica((await prisma.importazioneArticoli.findUnique({ where: { id: imp2 } }))!.stato === "ANNULLATA", "anteprima annullata");
  const bad = await redirectA(A.caricaListino(fd({ file: new File([Buffer.from("D0CF11E0A1B11AE1", "hex")], "vecchio.xls") })));
  verifica(/xlsx/.test(decodeURIComponent(bad ?? "")), "file .xls vecchio: messaggio chiaro", bad);

  console.log("6. Regole e aggiornamenti in blocco");
  await redirectA(A.salvaCategoria(fd({ id: perg.id, nome: "Pergole", metodoPrezzo: "RICARICO", valore: "3", arrotondamento: "1", margineMinimo: "30", ricalcola: "1" })));
  verifica((await art("SOM-1"))!.prezzoVendita === 79 && (await art("MAN-1"))!.prezzoVendita === 120, "regola Pergole ×3: sottocategorie ricalcolate (26,25×3=78,75→79), prezzo a mano invariato");
  verifica((await art("SOM-1"))!.storico.some((s) => s.origine === "REGOLA"), "storico: ricalcolo regola");
  const blocco = await redirectA(A.aggiornamentoInBlocco(fd({ fornitoreId: somfy.id, variazione: "10" })));
  const s1 = (await art("SOM-1"))!;
  verifica(s1.prezzoListino === 57.75 && s1.costoAcquisto === 28.88 && s1.prezzoVendita === 87, "Somfy +10%: listino 57,75, costo 28,88, vendita 87", { s1, blocco });
  verifica((await art("FLT-10"))!.prezzoListino === null && (await art("FLT-10"))!.costoAcquisto === 6.8, "articoli di altri fornitori non toccati");
  const cat = await redirectA(A.eliminaCategoria(fd({ id: perg.id })));
  verifica(/Non si può eliminare/.test(decodeURIComponent(cat ?? "")), "categoria con articoli non eliminabile");

  console.log("7. Ordini fornitori dal catalogo");
  const o = await prisma.ordineFornitore.create({ data: { numero: 1, anno: 2027, fornitoreId: somfy.id } });
  await A.aggiungiArticoloAOrdine(fd({ ordineId: o.id, articolo: `SOM-1 — Telecomando Situo 1 [SOM-1]`, quantita: "3" }));
  const ro = await prisma.rigaOrdine.findFirst({ where: { ordineFornitoreId: o.id } });
  verifica(ro?.articoloId === s1.id && ro.quantita === 3 && ro.prezzoAcquisto === 57.75 && ro.scontoAcquisto === 50 && ro.codiceFornitore === "SOM-1", "riga d'ordine con codice fornitore, listino e sconto dal catalogo", ro);
  g.__utente = ammin;
  await A.aggiungiArticoloAOrdine(fd({ ordineId: o.id, articolo: "ART-00001 — Motore", quantita: "1" }));
  const ro2 = await prisma.rigaOrdine.findFirst({ where: { ordineFornitoreId: o.id, codice: "ART-00001" } });
  verifica(ro2?.scontoAcquisto === 55 && ro2.prezzoAcquisto === 286, "anche l'ufficio acquisti può aggiungere dal catalogo (listino 260 +10% = 286, sconto 50+10 = 55%)", ro2);
  g.__utente = capo;
  const del = await redirectA(A.eliminaArticolo(fd({ id: s1.id })));
  verifica(/disattivato/.test(del ?? "") && (await art("SOM-1"))!.attivo === false, "articolo usato in un ordine: disattivato, non eliminato");
  const del2 = await redirectA(A.eliminaArticolo(fd({ id: (await art("MAN-1"))!.id })));
  verifica(/eliminato/.test(del2 ?? "") && !(await art("MAN-1")), "articolo mai usato: eliminato");

  console.log("8. Modello e AI (risposte simulate)");
  const mod = await modello(new Request("http://x/api/articoli/modello"));
  const fm = leggiFile("m.xlsx", Buffer.from(await mod.arrayBuffer()));
  verifica(fm.map((f) => f.nome).join() === "Articoli,Istruzioni,Categorie,Fornitori" && fm[2].righe.some((x) => x[1] === "Comandi"), "modello Excel: 4 fogli con categorie e fornitori veri", fm.map((f) => f.nome));
  const vero = globalThis.fetch;
  delete process.env.ANTHROPIC_API_KEY;
  const pdf = new File([Buffer.from("%PDF-1.4 finto")], "listino acqua.pdf", { type: "application/pdf" });
  let res = await ai(new Request("http://x/api/articoli/ai", { method: "POST", body: fd({ azione: "listino", file: pdf }) }));
  verifica(res.status === 502 && /ANTHROPIC_API_KEY/.test((await res.json()).errore), "senza chiave: messaggio che spiega cosa configurare");
  process.env.ANTHROPIC_API_KEY = "sk-prova";
  let inviato: { headers: Record<string, string>; body: { model: string; messages: { content: { type: string }[] }[] } } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    inviato = { headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
    const testo = JSON.parse(String(init.body)).system.includes("CSV")
      ? "Ecco:\n```csv\nCODICE FORNITORE;DESCRIZIONE;CATEGORIA;SOTTOCATEGORIA;MARCA;UM;PREZZO LISTINO;SCONTI;COSTO NETTO;NOTE\nAP-1;Filtro 10\" 5 micron;Depurazione;Filtri;;pz;;;7,20;\nAP-2;Membrana osmosi 75 GPD;Depurazione;;;pz;;;38,00;\n```"
      : JSON.parse(String(init.body)).system.includes("controllore") ? "- Riga 3: costo alto rispetto agli altri filtri." : '{"descrizione":"Cartuccia carbone 10\\"","categoria":"Depurazione","sottocategoria":"","marca":"Atlas","codiceFornitore":"CB-10","ean":"","um":"pz","note":""}';
    return new Response(JSON.stringify({ content: [{ type: "text", text: testo }], stop_reason: "end_turn" }), { status: 200 });
  }) as typeof fetch;
  res = await ai(new Request("http://x/api/articoli/ai", { method: "POST", body: fd({ azione: "listino", file: pdf, fornitoreId: acqua.id }) }));
  const jl = await res.json();
  verifica(res.status === 200 && jl.righe === 2, "listino PDF letto dall'AI → anteprima con 2 righe", jl);
  verifica(inviato!.headers["x-api-key"] === "sk-prova" && inviato!.body.model === "claude-sonnet-5-5" && inviato!.body.messages[0].content[0].type === "document", "richiesta corretta ad Anthropic (chiave, modello, PDF come documento)");
  const anAi = await anteprima(jl.id);
  verifica(contaAnteprima(anAi.righe).nuovi === 2 && anAi.righe[0].vendita === 15 && anAi.righe[1].vendita === 65, "anteprima AI: costi letti e prezzi calcolati col margine della categoria", anAi.righe.map((x) => x.vendita));
  res = await ai(new Request("http://x/api/articoli/ai", { method: "POST", body: fd({ azione: "controllo", id: jl.id }) }));
  verifica(res.status === 200 && (await prisma.importazioneArticoli.findUnique({ where: { id: jl.id } }))!.controlloAi?.includes("Riga 3"), "controllo AI salvato sull'anteprima");
  const foto = new File([Buffer.from([0xff, 0xd8, 0xff])], "foto.jpg", { type: "image/jpeg" });
  res = await ai(new Request("http://x/api/articoli/ai", { method: "POST", body: fd({ azione: "foto", file: foto }) }));
  const jf = await res.json();
  verifica(jf.proposta?.marca === "Atlas" && inviato!.body.messages[0].content[0].type === "image", "foto: proposta di descrizione, marca e codice", jf);
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { type: "authentication_error", message: "invalid x-api-key" } }), { status: 401 })) as typeof fetch;
  res = await ai(new Request("http://x/api/articoli/ai", { method: "POST", body: fd({ azione: "foto", file: foto }) }));
  verifica(res.status === 502 && /non è valida/.test((await res.json()).errore), "chiave sbagliata: messaggio chiaro");
  g.__utente = ammin;
  res = await ai(new Request("http://x/api/articoli/ai", { method: "POST", body: fd({ azione: "foto", file: foto }) }));
  verifica(res.status === 401, "l'AI del catalogo è riservata agli amministratori");
  globalThis.fetch = vero;

  console.log(`\n${ok} controlli superati, ${ko} falliti`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
