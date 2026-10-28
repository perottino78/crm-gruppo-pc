// Aiuto AI dell'anagrafica articoli (solo amministratori).
//  azione=listino   → legge PDF/foto di un listino e apre un'anteprima d'importazione (nessun articolo modificato)
//  azione=controllo → controlla un'anteprima d'importazione e salva le osservazioni
//  azione=foto      → propone descrizione, categoria, marca… da una foto del prodotto
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { puoModificareArticoli, articoliPerConfronto, categorieRegola, nomeCategoria } from "@/lib/articoli/server";
import { chiediClaude, bloccoFile, promptListino, PROMPT_CONTROLLO, promptFoto, estraiCsv, estraiJson, ErroreAi, INTESTAZIONE_AI } from "@/lib/articoli/ai";
import { leggiCsvTesto, type Tabella } from "@/lib/articoli/foglio";
import { analizzaListino, mappaColonne, type Opzioni } from "@/lib/articoli/importa";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_AI = 4 * 1024 * 1024; // il limite di Vercel per una richiesta è 4,5 MB

const elencoCategorie = async () => {
  const cat = await prisma.categoriaArticolo.findMany({ select: { id: true, nome: true, padreId: true } });
  return cat.map((c) => nomeCategoria(c.id, cat)).sort();
};

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || !puoModificareArticoli(u)) return Response.json({ errore: "Solo gli amministratori possono usare l'AI sul catalogo." }, { status: 401 });
  let fd: FormData;
  try { fd = await req.formData(); } catch { return Response.json({ errore: "File troppo grande o richiesta non valida (massimo 4 MB in totale)." }, { status: 413 }); }
  const azione = String(fd.get("azione") ?? "");
  try {
    if (azione === "listino") {
      const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
      if (!files.length) return Response.json({ errore: "Scegli il PDF o le foto del listino." }, { status: 400 });
      if (files.reduce((s, f) => s + f.size, 0) > MAX_AI) return Response.json({ errore: "Oltre 4 MB in totale: dividi il PDF in parti più piccole o riduci le foto." }, { status: 413 });
      const blocchi = await Promise.all(files.map(async (f) => bloccoFile(f.name, f.type, Buffer.from(await f.arrayBuffer()))));
      const nota = String(fd.get("nota") ?? "").slice(0, 1000);
      const testo = await chiediClaude({ sistema: promptListino(await elencoCategorie(), nota), contenuto: [...blocchi, { type: "text", text: "Trasforma questo listino nella tabella CSV richiesta." }], maxTokens: 16000 });
      const { csv, troncato } = estraiCsv(testo);
      const tab: Tabella = leggiCsvTesto(csv);
      if (!mappaColonne(tab) || tab.length < 2) return Response.json({ errore: "L'AI non è riuscita a ricavare una tabella dal documento. Prova con un PDF più leggibile o con foto più nitide." }, { status: 422 });
      if (norm(tab[0]) !== norm(INTESTAZIONE_AI)) console.warn("intestazione AI diversa dal previsto", tab[0]);
      const opzioni: Opzioni & { troncato?: boolean } = {
        fornitoreId: (fd.get("fornitoreId") as string) || null, divisione: (fd.get("divisione") as string) || null,
        categoriaId: (fd.get("categoriaId") as string) || null, soloAggiornamento: fd.get("soloAggiornamento") === "1", troncato,
      };
      const imp = await prisma.importazioneArticoli.create({
        data: { nomeFile: `${files.map((f) => f.name).join(", ").slice(0, 160)} (letto dall'AI)`, origine: "AI", opzioni: opzioni as Prisma.InputJsonValue, righe: tab as Prisma.InputJsonValue, creataDaNome: u.nome },
      });
      return Response.json({ id: imp.id, righe: tab.length - 1, troncato });
    }

    if (azione === "controllo") {
      const imp = await prisma.importazioneArticoli.findUnique({ where: { id: String(fd.get("id") ?? "") } });
      if (!imp || imp.stato !== "ANTEPRIMA") return Response.json({ errore: "Importazione non trovata." }, { status: 404 });
      const [esistenti, fornitori, categorie, catNomi] = await Promise.all([
        articoliPerConfronto(), prisma.soggetto.findMany({ where: { ruoli: { has: "FORNITORE" } }, select: { id: true, ragioneSociale: true, scontoFornitore: true } }), categorieRegola(),
        prisma.categoriaArticolo.findMany({ select: { id: true, nome: true, padreId: true } }),
      ]);
      const an = analizzaListino(imp.righe as Tabella, imp.opzioni as Opzioni, esistenti, fornitori, categorie);
      const righe = an.righe.filter((r) => r.azione !== "ERRORE").slice(0, 600);
      const n = (x: number | null) => (x === null ? "" : String(x).replace(".", ","));
      const tabella = ["RIGA;AZIONE;CODICE;DESCRIZIONE;CATEGORIA;UM;COSTO;VENDITA;MARGINE%;AVVISI", ...righe.map((r) => {
        const cat = r.dati.categoriaNome ? `${r.dati.categoriaNome}${r.dati.sottocategoriaNome ? ` › ${r.dati.sottocategoriaNome}` : ""}` : nomeCategoria(r.dati.categoriaId ?? esistenti.find((e) => e.id === r.articoloId)?.categoriaId, catNomi);
        return [r.riga, r.azione, r.codice ?? r.dati.codiceFornitore ?? "", r.descrizione.replace(/;/g, ","), cat, r.dati.um ?? "", n(r.costo), n(r.vendita), n(r.margine), r.avvisi.join(" / ").replace(/;/g, ",")].join(";");
      })].join("\n");
      const testo = await chiediClaude({ sistema: PROMPT_CONTROLLO, contenuto: [{ type: "text", text: `Importazione «${imp.nomeFile}» (${righe.length} righe${an.righe.length > righe.length ? `, mostrate le prime ${righe.length}` : ""}):\n\n${tabella}` }], maxTokens: 3000 });
      await prisma.importazioneArticoli.update({ where: { id: imp.id }, data: { controlloAi: testo.replace(/#TRONCATO$/, "").slice(0, 20000) } });
      return Response.json({ testo });
    }

    if (azione === "foto") {
      const f = fd.get("file");
      if (!(f instanceof File) || !f.size) return Response.json({ errore: "Scegli una foto." }, { status: 400 });
      if (f.size > MAX_AI) return Response.json({ errore: "Foto oltre 4 MB: riducila." }, { status: 413 });
      const testo = await chiediClaude({ sistema: promptFoto(await elencoCategorie()), contenuto: [bloccoFile(f.name, f.type, Buffer.from(await f.arrayBuffer())), { type: "text", text: "Proponi i dati della scheda articolo." }], maxTokens: 1500 });
      const j = estraiJson<Record<string, string>>(testo);
      if (!j) return Response.json({ errore: "L'AI non ha restituito dati leggibili: riprova con un'altra foto." }, { status: 422 });
      return Response.json({ proposta: j });
    }
    return Response.json({ errore: "Azione sconosciuta." }, { status: 400 });
  } catch (e) {
    if (e instanceof ErroreAi) return Response.json({ errore: e.message }, { status: 502 });
    console.error("AI articoli", e);
    return Response.json({ errore: "Errore imprevisto durante l'elaborazione AI." }, { status: 500 });
  }
}

const norm = (r: string[]) => r.map((x) => x.trim().toUpperCase()).join(";");
