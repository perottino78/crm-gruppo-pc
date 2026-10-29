// Lettura con l'AI di bolle e fatture in PDF o foto.
//  azione=bolla   (magazzino)       → legge la bolla, compila la testata e propone le righe abbinate agli ordini aperti
//  azione=fattura (amministrazione) → legge una fattura PDF/foto e la crea «da verificare» con gli abbinamenti
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { chiediClaude, bloccoFile, estraiJson, ErroreAi } from "@/lib/articoli/ai";
import { puoMagazzino, righeDaRicevere } from "@/lib/magazzino/server";
import { puoAmministrazione } from "@/lib/amministrazione/server";
import { abbinaRighe } from "@/lib/magazzino/calcoli";
import { importaFattura } from "@/lib/fatture/server";
import { promptBolla, promptFattura, normalizzaFatturaAi, normalizzaBollaAi, type BollaAi, type FatturaAi } from "@/lib/fatture/ai";
import { MAX_DOCUMENTO, nomeFileSicuro, prezzoNetto } from "@/lib/ordini/calcoli";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return Response.json({ errore: "Accesso richiesto." }, { status: 401 });
  let fd: FormData;
  try { fd = await req.formData(); } catch { return Response.json({ errore: "File troppo grande o richiesta non valida (massimo 4 MB)." }, { status: 413 }); }
  const azione = String(fd.get("azione") ?? "");
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return Response.json({ errore: "Scegli il PDF o la foto." }, { status: 400 });
  if (file.size > MAX_DOCUMENTO) return Response.json({ errore: "File oltre 4 MB: riduci la foto o dividi il PDF." }, { status: 413 });
  const dati = Buffer.from(await file.arrayBuffer());
  try {
    if (azione === "bolla") {
      if (!puoMagazzino(u)) return Response.json({ errore: "Non autorizzato al magazzino." }, { status: 401 });
      const b = await prisma.bollaEntrata.findUnique({ where: { id: String(fd.get("bollaId") ?? "") }, include: { righe: { select: { rigaOrdineId: true, posizione: true } } } });
      if (!b || b.stato !== "APERTA") return Response.json({ errore: "Bolla non trovata o già registrata." }, { status: 404 });
      const testo = await chiediClaude({ sistema: promptBolla(), contenuto: [bloccoFile(file.name, file.type, dati), { type: "text", text: "Leggi questa bolla di consegna e restituisci il JSON richiesto." }], maxTokens: 8000 });
      const letta = normalizzaBollaAi(estraiJson<BollaAi>(testo));
      if (!letta) return Response.json({ errore: "L'AI non è riuscita a leggere la bolla. Prova con una foto più nitida." }, { status: 422 });
      // abbinamento con le righe ancora da ricevere dal fornitore della bolla
      const aperte = b.fornitoreId ? (await righeDaRicevere(b.fornitoreId)).filter((r) => !b.righe.some((x) => x.rigaOrdineId === r.id)) : [];
      const abb = abbinaRighe(letta.righe, aperte.map((r) => ({ id: r.id, codice: r.codice, codiceFornitore: r.codiceFornitore, descrizione: r.descrizione, residuo: r.quantita - r.quantitaArrivata })));
      // righe non ordinate: si prova l'anagrafica articoli del fornitore per codice
      const codici = letta.righe.map((r) => r.codice).filter(Boolean) as string[];
      const articoli = codici.length ? await prisma.articolo.findMany({ where: { OR: [{ codiceFornitore: { in: codici } }, { codice: { in: codici } }], ...(b.fornitoreId ? { fornitoreId: b.fornitoreId } : {}) } }) : [];
      let pos = b.righe.reduce((m, r) => Math.max(m, r.posizione), 0);
      let abbinate = 0;
      for (const [i, r] of letta.righe.entries()) {
        const ro = abb[i] ? aperte.find((x) => x.id === abb[i]) : undefined;
        const art = !ro && r.codice ? articoli.find((a) => a.codiceFornitore === r.codice || a.codice === r.codice) : undefined;
        if (ro) abbinate++;
        await prisma.rigaBolla.create({
          data: {
            bollaId: b.id, posizione: ++pos, rigaOrdineId: ro?.id ?? null, ordineFornitoreId: ro?.ordineFornitoreId ?? null, commessaId: ro?.commessaId ?? null,
            articoloId: ro?.articoloId ?? art?.id ?? null, codice: ro?.codice ?? art?.codice ?? null, codiceFornitore: r.codice ?? ro?.codiceFornitore ?? null,
            descrizione: ro?.descrizione ?? r.descrizione, um: r.um ?? ro?.um ?? art?.um ?? "pz", quantitaBolla: r.quantita ?? 1,
            destinazione: ro ? (ro.commessaId ? "COMMESSA" : "MAGAZZINO") : "MAGAZZINO", prezzo: ro ? prezzoNetto(ro.prezzoAcquisto, ro.scontoAcquisto) : art?.costoAcquisto ?? null,
            note: ro ? null : "Non trovata negli ordini aperti: verificare.",
          },
        });
      }
      await prisma.bollaEntrata.update({
        where: { id: b.id },
        data: { numeroDdt: b.numeroDdt ?? letta.numero, dataDdt: b.dataDdt ?? (letta.data ? new Date(`${letta.data}T12:00:00Z`) : null), letturaAi: letta as unknown as Prisma.InputJsonValue },
      });
      await prisma.documento.create({ data: { entita: "BOLLA_ENTRATA", entitaId: b.id, cartella: "Bolla", nome: nomeFileSicuro(file.name), mime: file.type || "application/pdf", dimensione: file.size, contenuto: dati, caricatoDaNome: u.nome } });
      return Response.json({ righe: letta.righe.length, abbinate, fornitoreLetto: letta.fornitore });
    }

    if (azione === "fattura") {
      if (!puoAmministrazione(u)) return Response.json({ errore: "Area riservata all'amministrazione." }, { status: 401 });
      const testo = await chiediClaude({ sistema: promptFattura(), contenuto: [bloccoFile(file.name, file.type, dati), { type: "text", text: "Leggi questa fattura e restituisci il JSON richiesto." }], maxTokens: 12000 });
      const letta = normalizzaFatturaAi(estraiJson<FatturaAi>(testo));
      if (!letta) return Response.json({ errore: "L'AI non è riuscita a leggere la fattura (servono almeno fornitore, numero e data)." }, { status: 422 });
      const esito = await importaFattura(letta, { xml: null, origine: "PDF", creatoDaNome: u.nome });
      if (esito.stato === "NUOVA" && esito.id) {
        await prisma.documento.create({ data: { entita: "FATTURA_ACQUISTO", entitaId: esito.id, cartella: "Fattura", nome: nomeFileSicuro(file.name), mime: file.type || "application/pdf", dimensione: file.size, contenuto: dati, caricatoDaNome: u.nome } });
      }
      return Response.json(esito);
    }
    return Response.json({ errore: "Azione non valida." }, { status: 400 });
  } catch (e) {
    if (e instanceof ErroreAi) return Response.json({ errore: e.message }, { status: 503 });
    console.error("AI documenti", e);
    return Response.json({ errore: "Errore durante la lettura: riprova." }, { status: 500 });
  }
}
