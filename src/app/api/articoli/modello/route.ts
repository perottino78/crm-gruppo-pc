// Modello vuoto per l'importazione articoli: foglio da compilare, istruzioni, elenco categorie e fornitori.
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { puoVedereArticoli } from "@/lib/articoli/server";
import { testoRegola } from "@/lib/articoli/prezzi";
import { COLONNE } from "@/lib/articoli/importa";
import { scriviXlsx, scriviCsv, type Cella } from "@/lib/articoli/foglio";

export const dynamic = "force-dynamic";

const ESEMPI: Record<string, Cella>[] = [
  { codiceFornitore: "SOM-1240", descrizione: "Motore tubolare Somfy Oximo 40 WT 10/17", categoria: "Pergole", sottocategoria: "Motori", fornitore: "", marca: "Somfy", divisione: "P&C", um: "pz", aliquotaIva: 22, prezzoListino: 245, sconti: "50+10" },
  { codiceFornitore: "FLT-10", descrizione: "Cartuccia filtro sedimenti 10\" 5 micron", categoria: "Depurazione", sottocategoria: "Filtri", divisione: "Purafonte", um: "pz", aliquotaIva: 22, costoAcquisto: 6.8, metodoPrezzo: "MARGINE", margine: 55 },
];

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || !puoVedereArticoli(u)) return new Response("Non autorizzato", { status: 401 });
  const formato = new URL(req.url).searchParams.get("formato");
  const testata = COLONNE.map((c) => c.titolo);
  const esempi = ESEMPI.map((e) => COLONNE.map((c) => e[c.campo] ?? null));
  if (formato === "csv") {
    return new Response(scriviCsv([testata, ...esempi]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="modello-articoli.csv"` } });
  }
  const [cat, forn] = await Promise.all([
    prisma.categoriaArticolo.findMany({ orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
    prisma.soggetto.findMany({ where: { attivo: true, ruoli: { has: "FORNITORE" } }, orderBy: { ragioneSociale: "asc" }, select: { ragioneSociale: true, scontoFornitore: true } }),
  ]);
  const madri = cat.filter((c) => !c.padreId);
  const righeCat: Cella[][] = [["CATEGORIA", "SOTTOCATEGORIA", "REGOLA DI PREZZO", "ARROTONDAMENTO", "MARGINE MINIMO %"]];
  for (const m of madri) {
    righeCat.push([m.nome, "", testoRegola({ metodo: m.metodoPrezzo, valore: m.valore }), m.arrotondamento, m.margineMinimo]);
    for (const f of cat.filter((c) => c.padreId === m.id)) righeCat.push([m.nome, f.nome, f.metodoPrezzo ? testoRegola({ metodo: f.metodoPrezzo, valore: f.valore }) : "come la categoria", f.arrotondamento, f.margineMinimo]);
  }
  const istruzioni: Cella[][] = [
    ["COLONNA", "COSA SCRIVERE"],
    ...COLONNE.map((c) => [c.titolo, c.spiegazione]),
    ["", ""],
    ["COME FUNZIONA", "Compila il foglio «Articoli» (le due righe d'esempio puoi cancellarle). L'ordine delle colonne è libero e quelle che non ti servono puoi toglierle: conta il titolo."],
    ["", "Al caricamento il CRM mostra un'anteprima: articoli nuovi, modificati (con il prezzo vecchio accanto al nuovo), errori. Niente viene salvato finché non confermi."],
    ["", "Un articolo già presente si riconosce dal CODICE, oppure da FORNITORE + CODICE FORNITORE. Le celle vuote non cancellano i dati già inseriti."],
    ["", "Per aggiornare i prezzi: esporta gli articoli dal CRM, cambia i prezzi nel file e ricaricalo."],
    ["", "Puoi caricare anche il listino del fornitore così com'è: il CRM riconosce titoli come Codice, Descrizione, Prezzo, Sconto."],
  ];
  const buf = scriviXlsx([
    { nome: "Articoli", righe: [testata, ...esempi], larghezze: COLONNE.map((c) => c.larghezza), numeriDecimali: COLONNE.map((c, i) => (["prezzoListino", "costoAcquisto", "prezzoVendita"].includes(c.campo) ? i : -1)).filter((i) => i >= 0) },
    { nome: "Istruzioni", righe: istruzioni, larghezze: [22, 120] },
    { nome: "Categorie", righe: righeCat, larghezze: [24, 24, 22, 16, 18] },
    { nome: "Fornitori", righe: [["FORNITORE (scrivi così nella colonna FORNITORE)", "SCONTO D'ACQUISTO %"], ...forn.map((f) => [f.ragioneSociale, f.scontoFornitore])], larghezze: [48, 22] },
  ]);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="modello-articoli.xlsx"` } });
}
