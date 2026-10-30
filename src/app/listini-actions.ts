"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listinoDiTipologia } from "@/lib/prodotti";
import { calcolaArticolo } from "@/lib/articoli/prezzi";
import { categorieRegola } from "@/lib/articoli/server";
import { aumenta, leggiPercentuale, listiniOptional, leggiChiaveListino, optionalDaAumentare, testoPercentuale, type Arrotondamento, type ValorePrecedente } from "@/lib/listini/aumenti";

type Tx = Prisma.TransactionClient;
const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };

async function amministratore() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.ruolo !== "AMMINISTRATORE") redirect("/prodotti/aumenti?errore=permesso");
  return u;
}

/** Aggiorna molte righe con un solo comando per blocco: (id, nuovo valore). */
async function aggiornaInBlocco(tx: Tx, tabella: "Prodotto" | "Optional", colonna: "prezzoBase" | "valore", righe: [string, number][]) {
  for (let i = 0; i < righe.length; i += 1000) {
    const valori = Prisma.join(righe.slice(i, i + 1000).map(([id, v]) => Prisma.sql`(${id}, ${v}::double precision)`));
    await tx.$executeRaw`UPDATE ${Prisma.raw(`"${tabella}"`)} AS t SET ${Prisma.raw(`"${colonna}"`)} = v.n FROM (VALUES ${valori}) AS v(id, n) WHERE t.id = v.id`;
  }
}

export async function applicaAumento(formData: FormData) {
  const u = await amministratore();
  const percentuale = leggiPercentuale(str(formData, "percentuale"));
  const arr = (str(formData, "arrotondamento") ?? "CENTESIMI") as Arrotondamento;
  const chiavi = formData.getAll("listino").filter((x): x is string => typeof x === "string").map(leggiChiaveListino).filter((x) => x !== null);
  const conOptional = formData.get("conOptional") === "on";
  const fornitoreArticoli = str(formData, "fornitoreArticoli");
  const nota = str(formData, "nota");
  const ritorno = str(formData, "ritorno") ?? "/prodotti/aumenti";
  if (percentuale === null) redirect(`${ritorno}${ritorno.includes("?") ? "&" : "?"}errore=percentuale`);
  if (chiavi.length === 0 && !fornitoreArticoli) redirect(`${ritorno}${ritorno.includes("?") ? "&" : "?"}errore=vuoto`);

  const [brand, fornitore] = await Promise.all([
    prisma.brand.findMany({ select: { id: true, nome: true } }),
    fornitoreArticoli ? prisma.soggetto.findUnique({ where: { id: fornitoreArticoli }, select: { ragioneSociale: true } }) : null,
  ]);
  const nomeBrand = (id: string) => brand.find((b) => b.id === id)?.nome ?? "?";

  const id = await prisma.$transaction(async (tx) => {
    const prima: ValorePrecedente[] = [];
    let nPrezzi = 0, nOptional = 0, nArticoli = 0;
    // raggruppa le tipologie per marchio
    const perBrand = new Map<string, string[]>();
    for (const c of chiavi) perBrand.set(c.brandId, [...(perBrand.get(c.brandId) ?? []), c.tipologia]);

    for (const [brandId, tipologie] of perBrand) {
      const prodotti = await tx.prodotto.findMany({ where: { brandId, tipologia: { in: tipologie } }, select: { id: true, prezzoBase: true } });
      const nuovi: [string, number][] = [];
      for (const p of prodotti) {
        const n = aumenta(p.prezzoBase, percentuale!, arr);
        if (n !== p.prezzoBase) { nuovi.push([p.id, n]); prima.push(["P", p.id, p.prezzoBase]); }
      }
      await aggiornaInBlocco(tx, "Prodotto", "prezzoBase", nuovi);
      nPrezzi += nuovi.length;

      if (conOptional) {
        const optional = await tx.optional.findMany({ where: { brandId, listino: { in: listiniOptional(tipologie, listinoDiTipologia) } }, select: { id: true, valore: true, tipoPrezzo: true } });
        const nuoviO: [string, number][] = [];
        for (const o of optional.filter(optionalDaAumentare)) {
          const n = aumenta(o.valore, percentuale!, arr);
          if (n !== o.valore) { nuoviO.push([o.id, n]); prima.push(["O", o.id, o.valore]); }
        }
        await aggiornaInBlocco(tx, "Optional", "valore", nuoviO);
        nOptional += nuoviO.length;
      }
    }

    // Articoli a pezzo del fornitore: aumenta il listino (o il costo se non c'è listino), poi ricalcola la vendita con le regole
    if (fornitoreArticoli) {
      const regole = await categorieRegola(tx);
      const articoli = await tx.articolo.findMany({ where: { fornitoreId: fornitoreArticoli, attivo: true } });
      for (const a of articoli) {
        const listino = a.prezzoListino ? aumenta(a.prezzoListino, percentuale!, arr) : a.prezzoListino;
        const costoDiretto = !a.prezzoListino && a.costoAcquisto ? aumenta(a.costoAcquisto, percentuale!, arr) : a.costoAcquisto;
        if (listino === a.prezzoListino && costoDiretto === a.costoAcquisto) continue;
        const c = calcolaArticolo({ ...a, prezzoListino: listino, costoAcquisto: costoDiretto }, regole);
        const vendita = c.regola && c.regola.metodo !== "MANUALE" && c.vendita !== null ? c.vendita : a.prezzoVendita;
        prima.push(["A", a.id, a.prezzoListino, a.costoAcquisto, a.prezzoVendita]);
        const agg = await tx.articolo.update({ where: { id: a.id }, data: { prezzoListino: listino, costoAcquisto: c.costo ?? costoDiretto, prezzoVendita: vendita, aggiornatoDaNome: u.nome } });
        await tx.storicoPrezzoArticolo.create({ data: { articoloId: a.id, prezzoListino: agg.prezzoListino, costoAcquisto: agg.costoAcquisto, prezzoVendita: agg.prezzoVendita, origine: "AGGIORNAMENTO", nota: `Aumento listino ${testoPercentuale(percentuale!)}`, utenteNome: u.nome } });
        nArticoli++;
      }
    }

    const listini = chiavi.map((c) => `${nomeBrand(c.brandId)} · ${c.tipologia}`);
    const parti = [listini.length ? `${listini.length} listini` : null, fornitore ? `articoli di ${fornitore.ragioneSociale}` : null].filter(Boolean).join(" + ");
    const r = await tx.aumentoListino.create({
      data: {
        utenteNome: u.nome, percentuale: percentuale!, arrotondamento: arr, descrizione: `${testoPercentuale(percentuale!)} su ${parti}`,
        fornitoreId: fornitoreArticoli, listini, prezzi: nPrezzi, optional: nOptional, articoli: nArticoli, nota, valoriPrecedenti: prima as unknown as Prisma.InputJsonValue,
      },
    });
    return r.id;
  }, { timeout: 280000, maxWait: 20000 });

  revalidatePath("/prodotti");
  redirect(`/prodotti/aumenti?fatto=${id}`);
}

export async function annullaAumento(formData: FormData) {
  const u = await amministratore();
  const id = str(formData, "id");
  if (!id) return;
  const aum = await prisma.aumentoListino.findUnique({ where: { id } });
  if (!aum || aum.annullatoIl) redirect("/prodotti/aumenti");
  const prima = (aum.valoriPrecedenti ?? []) as unknown as ValorePrecedente[];
  await prisma.$transaction(async (tx) => {
    await aggiornaInBlocco(tx, "Prodotto", "prezzoBase", prima.filter((v) => v[0] === "P").map((v) => [v[1], v[2] ?? 0]));
    await aggiornaInBlocco(tx, "Optional", "valore", prima.filter((v) => v[0] === "O").map((v) => [v[1], v[2] ?? 0]));
    for (const v of prima.filter((x) => x[0] === "A")) {
      const a = await tx.articolo.updateMany({ where: { id: v[1] }, data: { prezzoListino: v[2], costoAcquisto: v[3] ?? null, prezzoVendita: v[4] ?? null, aggiornatoDaNome: u.nome } });
      if (a.count) await tx.storicoPrezzoArticolo.create({ data: { articoloId: v[1], prezzoListino: v[2], costoAcquisto: v[3] ?? null, prezzoVendita: v[4] ?? null, origine: "AGGIORNAMENTO", nota: `Annullato aumento ${testoPercentuale(aum!.percentuale)}`, utenteNome: u.nome } });
    }
    await tx.aumentoListino.update({ where: { id }, data: { annullatoIl: new Date(), annullatoDa: u.nome } });
  }, { timeout: 280000, maxWait: 20000 });
  revalidatePath("/prodotti");
  redirect(`/prodotti/aumenti?annullato=${id}`);
}
