// Pavimenti galleggianti su piedini (OUTDOOR › PAVIMENTI › «Pavimenti galleggianti»): piastrelle in gres porcellanato da esterno
// spessore 2 cm (antiscivolo «AS», ~44 kg/m²) del listino CERAMICA LA FAENZA 2025, prezzo = colonna «1^ scelta» del listino
// (già al cliente). Articoli in prisma/seed-data/pavgal_articoli.json (scripts/listini/estrai_pavgal.py).
// Accessori P&C (piedini, posa, trasferta, autoscala, angolari) dal foglio «Accessori per pavimentazione galleggiante».
// Modulo puro: lo usano la rotta api/admin/seed-pavimenti-galleggianti e la pagina dell'offerta.

export const PREFISSO_PAVGAL = "PAVGAL_";
export const SOTTOGRUPPO_PAVGAL = "Pavimenti galleggianti";

export type ArticoloPavgal = { codice: string; nome: string; famiglia: string; collezione: string; formato: string; um: "MQ" | "PZ"; prezzo: number; kgMq: number };

const NOME_PEZZO: Record<string, string> = { SB: "Square border costa lucida", GR: "Gradone costa lucida", BP: "Bordo piscina costa lucida", GP: "Griglia piscina" };

const formatoChiave = (f: string) => f.toUpperCase().replace(".", "");
export const tipologiaPavgal = (famiglia: string, formato: string) => `${PREFISSO_PAVGAL}${famiglia}_${formatoChiave(formato)}`;

/** Piastrelle per m² e piedini (4 per piastrella, come da indicazioni P&C) per un formato «60x60». */
export function piedini(formato: string): { piastrelleMq: number; piediniMq: number; prezzoPiedino: number } {
  const [a, b] = formato.split("x").map(Number);
  const piastrelleMq = 10000 / (a * b);
  const prezzoPiedino = Math.max(a, b) >= 90 ? 6 : 4; // 4 € il 60×60, 6 € i formati lunghi/grandi (indicazione P&C: 6 € il 20×120)
  return { piastrelleMq, piediniMq: piastrelleMq * 4, prezzoPiedino };
}

export function catalogoPavgal(articoli: ArticoloPavgal[]) {
  const piastrelle = articoli.filter((a) => a.um === "MQ");
  const tipologie = new Map<string, { famiglia: string; collezione: string; formato: string }>();
  for (const a of piastrelle) tipologie.set(tipologiaPavgal(a.famiglia, a.formato), { famiglia: a.famiglia, collezione: a.collezione, formato: a.formato });

  const prodotti = piastrelle.map((a) => ({
    tipologia: tipologiaPavgal(a.famiglia, a.formato), colore: `${a.nome} (cod. ${a.codice}) — al m²`, larghezzaMm: 0, altezzaMm: 0, prezzoBase: a.prezzo,
  }));

  const modelli = [...tipologie.entries()].map(([tipologia, t]) => {
    const p = piedini(t.formato);
    return {
      tipologia,
      immagineUrl: "/immagini/pavimenti-galleggianti/terrazza.jpg",
      descrizioneTecnica:
        `Pavimento galleggiante per esterni su piedini regolabili: piastrelle in gres porcellanato colorato in massa ${t.collezione}, ` +
        `formato ${t.formato.replace("x", "×")} cm, spessore 2 cm, antiscivolo, rettificate (Ceramica La Faenza). Posa a secco su piedini ` +
        `regolabili in altezza (4 per piastrella, circa ${p.piediniMq.toFixed(1).replace(".", ",")} al m²), senza colla né massetto: ` +
        `ideale per terrazzi e lastrici, ispezionabile. Peso circa 45 kg/m² (verificare la portata dei piani superiori: 60 kg/m² con i piedini). Prezzo al m².`,
    };
  });

  const optional: { categoria: string; nome: string; tipoPrezzo: "FISSO"; valore: number; unita: string | null; listino: string }[] = [];
  // pezzi speciali della collezione (al pezzo)
  for (const a of articoli.filter((x) => x.um === "PZ")) {
    const sigla = a.nome.replace(a.famiglia, "").trim().slice(0, 2);
    const tipo = NOME_PEZZO[sigla] ?? "Pezzo speciale";
    optional.push({ categoria: "Pezzi speciali", nome: `${tipo} ${a.formato.replace("x", "×")} — ${a.nome} (cod. ${a.codice})`, tipoPrezzo: "FISSO", valore: a.prezzo, unita: "pz", listino: `${PREFISSO_PAVGAL}${a.famiglia}` });
  }
  // piedini al m² per formato
  for (const f of [...new Set(piastrelle.map((a) => a.formato))]) {
    const p = piedini(f);
    optional.push({
      categoria: "Piedini regolabili", nome: `Piedini regolabili per ${f.replace("x", "×")}: 4 per piastrella, ${p.piediniMq.toFixed(1).replace(".", ",")} al m² a ${p.prezzoPiedino} € (al m²)`,
      tipoPrezzo: "FISSO", valore: Math.round(p.piediniMq * p.prezzoPiedino * 100) / 100, unita: "m²", listino: `${PREFISSO_PAVGAL}F${formatoChiave(f)}`,
    });
  }
  // accessori e servizi P&C (comuni)
  const comune = (categoria: string, nome: string, valore: number, unita: string | null = null) => optional.push({ categoria, nome, tipoPrezzo: "FISSO", valore, unita, listino: "PAVGAL" });
  comune("Piedini regolabili", "Piedino regolabile singolo 60×60 (al pezzo)", 4, "pz");
  comune("Piedini regolabili", "Piedino regolabile singolo formati grandi (al pezzo)", 6, "pz");
  comune("Finiture", "Angolare di finitura 5×10×300 (al metro lineare)", 15, "ml");
  comune("Finiture", "Angolare battiscopa 5×10×300 (al metro lineare)", 15, "ml");
  comune("Posa e servizi", "Posa in opera (al m², non scontabile)", 50, "m²");
  comune("Posa e servizi", "Trasferta (andata e ritorno)", 150);
  comune("Posa e servizi", "Autoscala per la portata al piano", 250);
  comune("Posa e servizi", "Autoscala su suolo pubblico", 500);
  return { prodotti, modelli, optional, tipologie };
}

/** Listini degli optional per la tipologia: comune, pezzi speciali della collezione, piedini del formato. */
export function listiniPavgal(tipologia: string): string[] {
  const m = tipologia.match(/^PAVGAL_([A-Z]+)_(\d+X\d+)$/);
  return m ? ["PAVGAL", `${PREFISSO_PAVGAL}${m[1]}`, `${PREFISSO_PAVGAL}F${m[2]}`] : [];
}

const COLLEZIONI: Record<string, string> = { BLANCO: "Blanco", FVNT: "Cocoon", LOIRA: "Loira (Cottofaenza)", DAMA: "Dama", GEA: "Gea", MAXXI: "Maxxi", ALGAR: "Algar", VIS: "Vis", YKSG: "Yakisugi" };
export function labelPavgal(tipologia: string): string | null {
  const m = tipologia.match(/^PAVGAL_([A-Z]+)_(\d+)X(\d+)$/);
  return m && COLLEZIONI[m[1]] ? `${COLLEZIONI[m[1]]} ${m[2]}×${m[3]} — gres 2 cm` : null;
}

export const GUIDA_PAVGAL =
  "Quantità = m² (arrotonda per eccesso e aggiungi lo sfrido per gli angoli). Aggiungi i piedini al m² del formato, la posa (50 €/m², non scontabile), " +
  "la trasferta e, se serve, autoscala/facchinaggio e angolari. Attenzione al peso sui piani superiori (60 kg/m²). Si vende a scatole intere.";
