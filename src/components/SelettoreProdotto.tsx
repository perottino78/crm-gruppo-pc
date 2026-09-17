"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { unitaMisura, etichetteDimensioni, type AssiZpc, type AssiModelloAnte, type AssiKopen, type AssiBlindati, type AssiMinibox, type AssiTapparelle } from "@/lib/prodotti";
import { galleriaKopenPerTipologia, lineaRealeDiTipologiaKopen, KOPEN_LINEA_NOME } from "@/lib/kopenGalleria";

export type NodoTipologia = {
  value: string;
  label: string;
  haMisura: boolean;
  varianti?: { id: string; colore: string; prezzoBase: number }[];
  // range di misure effettivamente a listino (solo per i modelli con haMisura=true)
  misure?: { larghezzaMin: number; larghezzaMax: number; altezzaMin: number; altezzaMax: number };
  // Zanzariere P&C: assi ante/variante → rete → colore, per mostrare 3 tendine a cascata
  // invece della lista piatta (18-54 voci per famiglia) quando presente su tutte le
  // tipologie di un sottogruppo.
  assi?: AssiZpc;
  // Persiane Blindate / Infissi in Acciaio: assi modello → numero ante, per mostrare
  // 2 tendine a cascata invece della lista piatta (27-68 voci per famiglia).
  assiModelloAnte?: AssiModelloAnte;
  // Kopen: assi linea -> combinazione materiali, per mostrare 2 tendine a cascata
  // invece della lista piatta per sottogruppo.
  assiKopen?: AssiKopen;
  // Blindati: assi classe -> numero ante -> variante due ante, per mostrare 3
  // tendine a cascata invece della lista piatta divisa per sottogruppo.
  assiBlindati?: AssiBlindati;
  // Minibox: assi misura cassonetto → tipologia tapparella, per mostrare 2 tendine
  // a cascata invece della lista piatta (fino a 69 voci per misura).
  assiMinibox?: AssiMinibox;
  // Tapparelle in PVC e Alluminio: assi materiale → modello → colore, per mostrare
  // 3 tendine a cascata (la tendina colore riporta anche l'aumento di prezzo).
  assiTapparelle?: AssiTapparelle;
  // Tipologie "in arrivo" (es. Pensilina Dritta prima che arrivi il listino): mostrate
  // in tendina per farsi vedere, ma non selezionabili — il testo qui e' il motivo da
  // mostrare al click invece di aprire la selezione.
  disabilitato?: string;
};
export type SottogruppoNodo = { nome: string; tipologie: NodoTipologia[] };
export type GruppoNodo = { nome: string; tipologie: NodoTipologia[]; sottogruppi?: SottogruppoNodo[] };
export type FamigliaNodo = { nome: string; gruppi: GruppoNodo[] };

// Tendine a cascata: 1) numero ante/variante, 2) tipo di rete, 3) colore. Ogni scelta
// filtra le opzioni successive alle sole combinazioni che esistono davvero a listino
// (es. la variante Pratik "profilo maggiorato" ha solo 2 tipi di rete, non 4), ed evita
// così di dover scorrere una lista piatta con decine di voci.
function SelettoreCascata({
  tipologie,
  selezionato,
  onScegli,
  onReset,
}: {
  tipologie: NodoTipologia[];
  selezionato: string | null;
  onScegli: (nodo: NodoTipologia) => void;
  onReset: () => void;
}) {
  const [ante, setAnte] = useState("");
  const [rete, setRete] = useState("");
  const [colore, setColore] = useState("");

  const opzioniAnte = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of tipologie) if (t.assi) mappa.set(t.assi.ante.valore, t.assi.ante.label);
    return [...mappa.entries()];
  }, [tipologie]);

  const filtratePerAnte = useMemo(() => tipologie.filter((t) => t.assi?.ante.valore === ante), [tipologie, ante]);
  const opzioniRete = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of filtratePerAnte) if (t.assi) mappa.set(t.assi.rete.valore, t.assi.rete.label);
    return [...mappa.entries()];
  }, [filtratePerAnte]);

  const filtratePerRete = useMemo(() => filtratePerAnte.filter((t) => t.assi?.rete.valore === rete), [filtratePerAnte, rete]);
  const opzioniColore = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of filtratePerRete) if (t.assi) mappa.set(t.assi.colore.valore, t.assi.colore.label);
    return [...mappa.entries()];
  }, [filtratePerRete]);

  const trovato = useMemo(
    () => filtratePerRete.find((t) => t.assi?.colore.valore === colore) ?? null,
    [filtratePerRete, colore]
  );

  useEffect(() => {
    if (trovato) {
      onScegli(trovato);
    } else if (selezionato && tipologie.some((t) => t.value === selezionato)) {
      onReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trovato]);

  return (
    <div className="flex flex-col gap-2 px-2 py-2">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-neutral-600">1. Numero ante / variante</label>
        <select
          value={ante}
          onChange={(e) => {
            setAnte(e.target.value);
            setRete("");
            setColore("");
          }}
          className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
        >
          <option value="">— seleziona —</option>
          {opzioniAnte.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      {ante && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-neutral-600">2. Tipo di rete</label>
          <select
            value={rete}
            onChange={(e) => {
              setRete(e.target.value);
              setColore("");
            }}
            className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
          >
            <option value="">— seleziona —</option>
            {opzioniRete.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      )}
      {ante && rete && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-neutral-600">3. Colore</label>
          <select
            value={colore}
            onChange={(e) => setColore(e.target.value)}
            className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
          >
            <option value="">— seleziona —</option>
            {opzioniColore.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      )}
      {trovato && (
        <p className="text-xs font-medium text-green-700">✓ {trovato.label} selezionato</p>
      )}
    </div>
  );
}

// Tendine a cascata piu' semplici, per i cataloghi Serramenti strutturati come
// "modello + numero ante" (Persiane Blindate, Infissi in Acciaio): 1) modello,
// 2) numero ante. Ogni scelta di modello filtra le opzioni di ante alle sole
// combinazioni davvero a listino (es. i due infissi "Fisso" hanno solo l'opzione
// fittizia "Fisso (senza apertura)").
function SelettoreCascataModelloAnte({
  tipologie,
  selezionato,
  onScegli,
  onReset,
}: {
  tipologie: NodoTipologia[];
  selezionato: string | null;
  onScegli: (nodo: NodoTipologia) => void;
  onReset: () => void;
}) {
  const [modello, setModello] = useState("");
  const [ante, setAnte] = useState("");

  const opzioniModello = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of tipologie) if (t.assiModelloAnte) mappa.set(t.assiModelloAnte.modello.valore, t.assiModelloAnte.modello.label);
    return [...mappa.entries()];
  }, [tipologie]);

  const filtratePerModello = useMemo(
    () => tipologie.filter((t) => t.assiModelloAnte?.modello.valore === modello),
    [tipologie, modello]
  );
  const opzioniAnte = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of filtratePerModello) if (t.assiModelloAnte) mappa.set(t.assiModelloAnte.ante.valore, t.assiModelloAnte.ante.label);
    return [...mappa.entries()];
  }, [filtratePerModello]);

  const trovato = useMemo(
    () => filtratePerModello.find((t) => t.assiModelloAnte?.ante.valore === ante) ?? null,
    [filtratePerModello, ante]
  );

  useEffect(() => {
    if (trovato) {
      onScegli(trovato);
    } else if (selezionato && tipologie.some((t) => t.value === selezionato)) {
      onReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trovato]);

  return (
    <div className="flex flex-col gap-2 px-2 py-2">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-neutral-600">1. Modello</label>
        <select
          value={modello}
          onChange={(e) => {
            setModello(e.target.value);
            setAnte("");
          }}
          className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
        >
          <option value="">— seleziona —</option>
          {opzioniModello.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      {modello && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-neutral-600">2. Numero ante</label>
          <select
            value={ante}
            onChange={(e) => setAnte(e.target.value)}
            className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
          >
            <option value="">— seleziona —</option>
            {opzioniAnte.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      )}
      {trovato && (
        <p className="text-xs font-medium text-green-700">✓ {trovato.label} selezionato</p>
      )}
    </div>
  );
}

// Tendine a cascata per i Portoncini Blindati: 1) classe (3/4), 2) numero ante
// (1 anta/2 ante), 3) variante due ante (Standard asimmetriche/Simmetriche) — la
// terza tendina compare solo quando la combinazione classe+ante scelta ha davvero
// piu' di una variante a listino (oggi solo Classe 3 a 2 ante: la Classe 4 esiste
// solo ad anta singola). Sostituisce i 2 sottogruppi piatti BLINDATI_SINGOLA/
// BLINDATI_DUEANTE usati in precedenza.
function SelettoreCascataBlindati({
  tipologie,
  selezionato,
  onScegli,
  onReset,
}: {
  tipologie: NodoTipologia[];
  selezionato: string | null;
  onScegli: (nodo: NodoTipologia) => void;
  onReset: () => void;
}) {
  const [classe, setClasse] = useState("");
  const [nAnte, setNAnte] = useState("");
  const [variante, setVariante] = useState("");

  const opzioniClasse = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of tipologie) if (t.assiBlindati) mappa.set(t.assiBlindati.classe.valore, t.assiBlindati.classe.label);
    return [...mappa.entries()];
  }, [tipologie]);

  const filtratePerClasse = useMemo(
    () => tipologie.filter((t) => t.assiBlindati?.classe.valore === classe),
    [tipologie, classe]
  );
  const opzioniNAnte = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of filtratePerClasse) if (t.assiBlindati) mappa.set(t.assiBlindati.nAnte.valore, t.assiBlindati.nAnte.label);
    return [...mappa.entries()];
  }, [filtratePerClasse]);

  const filtratePerNAnte = useMemo(
    () => filtratePerClasse.filter((t) => t.assiBlindati?.nAnte.valore === nAnte),
    [filtratePerClasse, nAnte]
  );
  const richiedeVariante = useMemo(
    () => filtratePerNAnte.some((t) => t.assiBlindati?.variante),
    [filtratePerNAnte]
  );
  const opzioniVariante = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of filtratePerNAnte) if (t.assiBlindati?.variante) mappa.set(t.assiBlindati.variante.valore, t.assiBlindati.variante.label);
    return [...mappa.entries()];
  }, [filtratePerNAnte]);

  const trovato = useMemo(() => {
    if (richiedeVariante) {
      return filtratePerNAnte.find((t) => t.assiBlindati?.variante?.valore === variante) ?? null;
    }
    return filtratePerNAnte.length === 1 ? filtratePerNAnte[0] : null;
  }, [filtratePerNAnte, richiedeVariante, variante]);

  useEffect(() => {
    if (trovato) {
      onScegli(trovato);
    } else if (selezionato && tipologie.some((t) => t.value === selezionato)) {
      onReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trovato]);

  return (
    <div className="flex flex-col gap-2 px-2 py-2">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-neutral-600">1. Classe</label>
        <select
          value={classe}
          onChange={(e) => {
            setClasse(e.target.value);
            setNAnte("");
            setVariante("");
          }}
          className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
        >
          <option value="">— seleziona —</option>
          {opzioniClasse.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      {classe && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-neutral-600">2. Numero ante</label>
          <select
            value={nAnte}
            onChange={(e) => {
              setNAnte(e.target.value);
              setVariante("");
            }}
            className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
          >
            <option value="">— seleziona —</option>
            {opzioniNAnte.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      )}
      {classe && nAnte && richiedeVariante && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-neutral-600">3. Variante</label>
          <select
            value={variante}
            onChange={(e) => setVariante(e.target.value)}
            className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
          >
            <option value="">— seleziona —</option>
            {opzioniVariante.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      )}
      {trovato && (
        <p className="text-xs font-medium text-green-700">✓ {trovato.label} selezionato</p>
      )}
    </div>
  );
}

// Tendine a cascata per Kopen: 1) linea (Modello liscio/Fresature/Bugnati/Inserti/
// Style/Vitrum/.../Effect — le stesse etichette gia' usate per la galleria foto
// reali), 2) combinazione materiali est./int. specifica di quella linea (es. "ALU
// fresato est. / legno liscio int."). Sostituisce la lista piatta di 1-3 voci per
// ciascuno dei 13 sottogruppi usata in precedenza con 2 tendine, come per Acciaio/
// Persiane Blindate.
function SelettoreCascataKopen({
  tipologie,
  selezionato,
  onScegli,
  onReset,
}: {
  tipologie: NodoTipologia[];
  selezionato: string | null;
  onScegli: (nodo: NodoTipologia) => void;
  onReset: () => void;
}) {
  const [linea, setLinea] = useState("");
  const [combinazione, setCombinazione] = useState("");

  const opzioniLinea = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of tipologie) if (t.assiKopen) mappa.set(t.assiKopen.linea.valore, t.assiKopen.linea.label);
    return [...mappa.entries()];
  }, [tipologie]);

  const filtratePerLinea = useMemo(
    () => tipologie.filter((t) => t.assiKopen?.linea.valore === linea),
    [tipologie, linea]
  );
  const opzioniCombinazione = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of filtratePerLinea) if (t.assiKopen) mappa.set(t.assiKopen.combinazione.valore, t.assiKopen.combinazione.label);
    return [...mappa.entries()];
  }, [filtratePerLinea]);

  const trovato = useMemo(
    () => filtratePerLinea.find((t) => t.assiKopen?.combinazione.valore === combinazione) ?? null,
    [filtratePerLinea, combinazione]
  );

  useEffect(() => {
    if (trovato) {
      onScegli(trovato);
    } else if (selezionato && tipologie.some((t) => t.value === selezionato)) {
      onReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trovato]);

  return (
    <div className="flex flex-col gap-2 px-2 py-2">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-neutral-600">1. Linea</label>
        <select
          value={linea}
          onChange={(e) => {
            setLinea(e.target.value);
            setCombinazione("");
          }}
          className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
        >
          <option value="">— seleziona —</option>
          {opzioniLinea.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      {linea && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-neutral-600">2. Combinazione materiali (est. / int.)</label>
          <select
            value={combinazione}
            onChange={(e) => setCombinazione(e.target.value)}
            className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
          >
            <option value="">— seleziona —</option>
            {opzioniCombinazione.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      )}
      {trovato && (
        <p className="text-xs font-medium text-green-700">✓ {trovato.label} selezionato</p>
      )}
    </div>
  );
}

// Tendine a cascata per Minibox: 1) misura cassonetto (165/185/205/250mm), 2) tipologia
// di tapparella (marca + tipo di manovra, o "Solo struttura"). Ogni misura filtra la
// tendina successiva alle sole tipologie effettivamente a listino per quel cassonetto
// (es. il 165 non ha manovra motorizzata/ad argano separata, il 250 ha marche in piu'
// rispetto al 185), evitando la lista piatta di 13-69 voci per misura.
function SelettoreCascataMinibox({
  tipologie,
  selezionato,
  onScegli,
  onReset,
}: {
  tipologie: NodoTipologia[];
  selezionato: string | null;
  onScegli: (nodo: NodoTipologia) => void;
  onReset: () => void;
}) {
  const [misura, setMisura] = useState("");
  const [tipo, setTipo] = useState("");

  const opzioniMisura = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of tipologie) if (t.assiMinibox) mappa.set(t.assiMinibox.misura.valore, t.assiMinibox.misura.label);
    return [...mappa.entries()].sort(([a], [b]) => Number(a) - Number(b));
  }, [tipologie]);

  const filtratePerMisura = useMemo(
    () => tipologie.filter((t) => t.assiMinibox?.misura.valore === misura),
    [tipologie, misura]
  );
  const opzioniTipo = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of filtratePerMisura) if (t.assiMinibox) mappa.set(t.assiMinibox.tipologia.valore, t.assiMinibox.tipologia.label);
    return [...mappa.entries()];
  }, [filtratePerMisura]);

  const trovato = useMemo(
    () => filtratePerMisura.find((t) => t.assiMinibox?.tipologia.valore === tipo) ?? null,
    [filtratePerMisura, tipo]
  );

  useEffect(() => {
    if (trovato) {
      onScegli(trovato);
    } else if (selezionato && tipologie.some((t) => t.value === selezionato)) {
      onReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trovato]);

  return (
    <div className="flex flex-col gap-2 px-2 py-2">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-neutral-600">1. Misura cassonetto</label>
        <select
          value={misura}
          onChange={(e) => {
            setMisura(e.target.value);
            setTipo("");
          }}
          className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
        >
          <option value="">— seleziona —</option>
          {opzioniMisura.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      {misura && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-neutral-600">2. Tipologia tapparella</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
          >
            <option value="">— seleziona —</option>
            {opzioniTipo.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      )}
      {trovato && (
        <p className="text-xs font-medium text-green-700">✓ {trovato.label} selezionato</p>
      )}
    </div>
  );
}

// Tendine a cascata per Tapparelle in PVC e Alluminio: 1) materiale, 2) modello
// (per ora solo L14, altri modelli in arrivo), 3) colore/finitura — quest'ultima
// tendina riporta anche l'aumento di prezzo rispetto alla Tinta Unita della stessa
// densita', cosi' e' visibile senza dover confrontare le tipologie una per una.
function SelettoreCascataTapparelle({
  tipologie,
  selezionato,
  onScegli,
  onReset,
}: {
  tipologie: NodoTipologia[];
  selezionato: string | null;
  onScegli: (nodo: NodoTipologia) => void;
  onReset: () => void;
}) {
  const [materiale, setMateriale] = useState("");
  const [modello, setModello] = useState("");
  const [colore, setColore] = useState("");

  const opzioniMateriale = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of tipologie) if (t.assiTapparelle) mappa.set(t.assiTapparelle.materiale.valore, t.assiTapparelle.materiale.label);
    return [...mappa.entries()];
  }, [tipologie]);

  const filtratePerMateriale = useMemo(
    () => tipologie.filter((t) => t.assiTapparelle?.materiale.valore === materiale),
    [tipologie, materiale]
  );
  const opzioniModello = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of filtratePerMateriale) if (t.assiTapparelle) mappa.set(t.assiTapparelle.modello.valore, t.assiTapparelle.modello.label);
    return [...mappa.entries()];
  }, [filtratePerMateriale]);

  const filtratePerModello = useMemo(
    () => filtratePerMateriale.filter((t) => t.assiTapparelle?.modello.valore === modello),
    [filtratePerMateriale, modello]
  );
  const opzioniColore = useMemo(() => {
    const mappa = new Map<string, string>();
    for (const t of filtratePerModello) if (t.assiTapparelle) mappa.set(t.assiTapparelle.colore.valore, t.assiTapparelle.colore.label);
    return [...mappa.entries()];
  }, [filtratePerModello]);

  const trovato = useMemo(
    () => filtratePerModello.find((t) => t.assiTapparelle?.colore.valore === colore) ?? null,
    [filtratePerModello, colore]
  );

  useEffect(() => {
    if (trovato) {
      onScegli(trovato);
    } else if (selezionato && tipologie.some((t) => t.value === selezionato)) {
      onReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trovato]);

  return (
    <div className="flex flex-col gap-2 px-2 py-2">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-neutral-600">1. Materiale</label>
        <select
          value={materiale}
          onChange={(e) => {
            setMateriale(e.target.value);
            setModello("");
            setColore("");
          }}
          className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
        >
          <option value="">— seleziona —</option>
          {opzioniMateriale.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      {materiale && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-neutral-600">2. Modello</label>
          <select
            value={modello}
            onChange={(e) => {
              setModello(e.target.value);
              setColore("");
            }}
            className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
          >
            <option value="">— seleziona —</option>
            {opzioniModello.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      )}
      {materiale && modello && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-neutral-600">3. Colore</label>
          <select
            value={colore}
            onChange={(e) => setColore(e.target.value)}
            className="border border-neutral-200 rounded px-2 py-1.5 text-xs"
          >
            <option value="">— seleziona —</option>
            {opzioniColore.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      )}
      {trovato && (
        <p className="text-xs font-medium text-green-700">✓ {trovato.label} selezionato</p>
      )}
    </div>
  );
}

export default function SelettoreProdotto({
  preventivoId,
  brandId,
  brandColor,
  tassonomia,
  azionePerMisura,
  azionePerProdotto,
}: {
  preventivoId: string;
  brandId: string;
  brandColor: string;
  tassonomia: FamigliaNodo[];
  azionePerMisura: (formData: FormData) => void;
  azionePerProdotto: (formData: FormData) => void;
}) {
  const [query, setQuery] = useState("");
  const [famigliaAperta, setFamigliaAperta] = useState<string | null>(null);
  const [gruppoAperto, setGruppoAperto] = useState<string | null>(null);
  const [sottogruppoAperto, setSottogruppoAperto] = useState<string | null>(null);
  const [scelto, setScelto] = useState<NodoTipologia | null>(null);
  const [larghezzaVal, setLarghezzaVal] = useState("");
  const [altezzaVal, setAltezzaVal] = useState("");
  const [erroreMisura, setErroreMisura] = useState<string | null>(null);

  const risultatiRicerca = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const out: { famiglia: string; gruppo: string; sottogruppo?: string; nodo: NodoTipologia }[] = [];
    for (const f of tassonomia) {
      for (const g of f.gruppi) {
        const liste = g.sottogruppi
          ? g.sottogruppi.map((sg) => ({ sottogruppo: sg.nome as string | undefined, tipologie: sg.tipologie }))
          : [{ sottogruppo: undefined as string | undefined, tipologie: g.tipologie }];
        for (const { sottogruppo, tipologie } of liste) {
          for (const t of tipologie) {
            if (t.label.toLowerCase().includes(q) || t.value.toLowerCase().includes(q)) {
              out.push({ famiglia: f.nome, gruppo: g.nome, sottogruppo, nodo: t });
            }
          }
        }
      }
    }
    return out;
  }, [query, tassonomia]);

  function scegli(nodo: NodoTipologia) {
    setScelto(nodo);
    setLarghezzaVal("");
    setAltezzaVal("");
    setErroreMisura(null);
  }

  function azzeraScelta() {
    setScelto(null);
    setLarghezzaVal("");
    setAltezzaVal("");
    setErroreMisura(null);
  }

  // controlla che la misura inserita sia un numero valido e rientri nel range di produzione
  // del modello scelto; restituisce il messaggio di errore da mostrare, o null se tutto ok
  function controllaMisure(nodo: NodoTipologia, larghezzaStr: string, altezzaStr: string): string | null {
    const larghezza = parseFloat(larghezzaStr.replace(",", "."));
    const altezza = parseFloat(altezzaStr.replace(",", "."));
    if (!larghezzaStr.trim() || !altezzaStr.trim() || !Number.isFinite(larghezza) || !Number.isFinite(altezza)) {
      return "Misura non valida: inserisci solo numeri per larghezza e altezza.";
    }
    if (larghezza <= 0 || altezza <= 0) {
      return "Misura non valida: i valori devono essere maggiori di zero.";
    }
    const unit = unitaMisura(nodo.value);
    if (nodo.misure) {
      const { larghezzaMin, larghezzaMax, altezzaMin, altezzaMax } = nodo.misure;
      // Blocco rigido su tutti i listini: la misura inserita deve rientrare nel range
      // effettivamente a listino (min-max delle fasce di prezzo caricate), sia per evitare
      // di andare sotto la misura minima prodotta sia per evitare di sforare il massimo —
      // altrimenti si rischia di applicare comunque il prezzo della fascia piu' vicina,
      // che per alcuni listini (es. un'unica fascia "fino a") puo' risultare un prezzo
      // sproporzionato rispetto alla misura realmente richiesta.
      if (larghezza < larghezzaMin || larghezza > larghezzaMax) {
        return `Larghezza fuori listino: per questo modello va da ${larghezzaMin} a ${larghezzaMax} ${unit}.`;
      }
      if (altezza < altezzaMin || altezza > altezzaMax) {
        return `Altezza/sporgenza fuori listino: per questo modello va da ${altezzaMin} a ${altezzaMax} ${unit}.`;
      }
    }
    return null;
  }

  function alSubmitMisura(e: FormEvent<HTMLFormElement>) {
    if (!scelto) return;
    const errore = controllaMisure(scelto, larghezzaVal, altezzaVal);
    setErroreMisura(errore);
    if (errore) {
      e.preventDefault();
      // Pop-up vero e proprio, non solo il testo sotto al campo: cosi' non passa
      // inosservato ed evita di procedere con una misura fuori listino.
      window.alert(`⚠️ Misura fuori listino\n\n${errore}`);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
      <h2 className="text-base font-bold text-neutral-900 mb-1">Aggiungi prodotto</h2>
      <p className="text-xs text-neutral-600 mb-3">
        Sfoglia Indoor / Outdoor per famiglia e modello, oppure cerca direttamente il nome se lo conosci già.
      </p>

      <div className="relative mb-3">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca modello per nome..."
          className="w-full border border-neutral-200 rounded px-2 py-1.5 pl-8 text-sm"
        />
      </div>

      {risultatiRicerca ? (
        <div className="border border-neutral-100 rounded-lg divide-y divide-neutral-50 max-h-72 overflow-y-auto mb-3">
          {risultatiRicerca.length === 0 && (
            <p className="px-3 py-3 text-sm text-neutral-600">Nessun modello corrisponde a &quot;{query}&quot;.</p>
          )}
          {risultatiRicerca.map(({ famiglia, gruppo, sottogruppo, nodo }) =>
            nodo.disabilitato ? (
              <button
                key={nodo.value}
                type="button"
                onClick={() => window.alert(nodo.disabilitato)}
                className="w-full text-left px-3 py-2 text-sm bg-red-50 text-red-400 cursor-not-allowed"
                title={nodo.disabilitato}
              >
                <span className="font-medium">{nodo.label}</span>
                <span className="block text-[11px] text-red-400">{famiglia} · {gruppo}{sottogruppo ? ` · ${sottogruppo}` : ""} · {nodo.disabilitato}</span>
              </button>
            ) : (
              <button
                key={nodo.value}
                type="button"
                onClick={() => scegli(nodo)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 ${scelto?.value === nodo.value ? "bg-neutral-50" : ""}`}
              >
                <span className="font-medium">{nodo.label}</span>
                <span className="block text-[11px] text-neutral-600">{famiglia} · {gruppo}{sottogruppo ? ` · ${sottogruppo}` : ""}</span>
              </button>
            )
          )}
        </div>
      ) : (
        <div className="border border-neutral-100 rounded-lg divide-y divide-neutral-50 mb-3">
          {tassonomia.map((f) => {
            const apertaF = famigliaAperta === f.nome;
            return (
              <div key={f.nome}>
                <button
                  type="button"
                  onClick={() => {
                    setFamigliaAperta(apertaF ? null : f.nome);
                    setGruppoAperto(null);
                    setSottogruppoAperto(null);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-base font-bold text-neutral-900 hover:bg-neutral-50"
                >
                  <span>{f.nome === "INDOOR" ? "🏠 Indoor" : f.nome === "OUTDOOR" ? "🌤️ Outdoor" : f.nome}</span>
                  <span className="text-neutral-500 text-xs">{apertaF ? "▲" : "▼"}</span>
                </button>
                {apertaF && (
                  <div className="pl-3 pb-1">
                    {f.gruppi.map((g) => {
                      const apertoG = gruppoAperto === g.nome;
                      const conteggioGruppo = g.sottogruppi
                        ? g.sottogruppi.reduce((tot, sg) => tot + sg.tipologie.length, 0)
                        : g.tipologie.length;
                      return (
                        <div key={g.nome} className="border-t border-neutral-50 first:border-t-0">
                          <button
                            type="button"
                            onClick={() => {
                              setGruppoAperto(apertoG ? null : g.nome);
                              setSottogruppoAperto(null);
                            }}
                            className="w-full flex items-center justify-between px-2 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                          >
                            <span>{g.nome} <span className="text-neutral-500 font-normal">({conteggioGruppo})</span></span>
                            <span className="text-neutral-500">{apertoG ? "▲" : "▼"}</span>
                          </button>
                          {apertoG && (
                            <div className="pl-3 pb-1">
                              {g.sottogruppi ? (
                                g.sottogruppi.map((sg) => {
                                  const chiaveSg = `${g.nome}|${sg.nome}`;
                                  const apertoSg = sottogruppoAperto === chiaveSg;
                                  return (
                                    <div key={sg.nome} className="border-t border-neutral-50 first:border-t-0">
                                      <button
                                        type="button"
                                        onClick={() => setSottogruppoAperto(apertoSg ? null : chiaveSg)}
                                        className="w-full flex items-center justify-between px-2 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                                      >
                                        <span>{sg.nome} <span className="text-neutral-500 font-normal">({sg.tipologie.length})</span></span>
                                        <span className="text-neutral-500">{apertoSg ? "▲" : "▼"}</span>
                                      </button>
                                      {apertoSg && (
                                        <div className="pl-3 pb-1 flex flex-col">
                                          {sg.tipologie.length > 0 && sg.tipologie.every((t) => t.assi) ? (
                                            <SelettoreCascata
                                              tipologie={sg.tipologie}
                                              selezionato={scelto?.value ?? null}
                                              onScegli={scegli}
                                              onReset={azzeraScelta}
                                            />
                                          ) : sg.tipologie.length > 0 && sg.tipologie.every((t) => t.assiModelloAnte) ? (
                                            <SelettoreCascataModelloAnte
                                              tipologie={sg.tipologie}
                                              selezionato={scelto?.value ?? null}
                                              onScegli={scegli}
                                              onReset={azzeraScelta}
                                            />
                                          ) : sg.tipologie.length > 0 && sg.tipologie.every((t) => t.assiKopen) ? (
                                            <SelettoreCascataKopen
                                              tipologie={sg.tipologie}
                                              selezionato={scelto?.value ?? null}
                                              onScegli={scegli}
                                              onReset={azzeraScelta}
                                            />
                                          ) : sg.tipologie.length > 0 && sg.tipologie.every((t) => t.assiBlindati) ? (
                                            <SelettoreCascataBlindati
                                              tipologie={sg.tipologie}
                                              selezionato={scelto?.value ?? null}
                                              onScegli={scegli}
                                              onReset={azzeraScelta}
                                            />
                                          ) : sg.tipologie.length > 0 && sg.tipologie.every((t) => t.assiMinibox) ? (
                                            <SelettoreCascataMinibox
                                              tipologie={sg.tipologie}
                                              selezionato={scelto?.value ?? null}
                                              onScegli={scegli}
                                              onReset={azzeraScelta}
                                            />
                                          ) : sg.tipologie.length > 0 && sg.tipologie.every((t) => t.assiTapparelle) ? (
                                            <SelettoreCascataTapparelle
                                              tipologie={sg.tipologie}
                                              selezionato={scelto?.value ?? null}
                                              onScegli={scegli}
                                              onReset={azzeraScelta}
                                            />
                                          ) : (
                                            sg.tipologie.map((t) =>
                                              t.disabilitato ? (
                                                <button
                                                  key={t.value}
                                                  type="button"
                                                  onClick={() => window.alert(t.disabilitato)}
                                                  className="text-left px-2 py-1.5 text-xs rounded bg-red-50 text-red-400 cursor-not-allowed"
                                                  title={t.disabilitato}
                                                >
                                                  {t.label}
                                                </button>
                                              ) : (
                                                <button
                                                  key={t.value}
                                                  type="button"
                                                  onClick={() => scegli(t)}
                                                  className={`text-left px-2 py-1.5 text-xs rounded hover:bg-neutral-50 ${scelto?.value === t.value ? "bg-neutral-100 font-medium" : "text-neutral-700"}`}
                                                >
                                                  {t.label}
                                                </button>
                                              )
                                            )
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="flex flex-col">
                                  {g.tipologie.map((t) =>
                                    t.disabilitato ? (
                                      <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => window.alert(t.disabilitato)}
                                        className="text-left px-2 py-1.5 text-xs rounded bg-red-50 text-red-400 cursor-not-allowed"
                                        title={t.disabilitato}
                                      >
                                        {t.label}
                                      </button>
                                    ) : (
                                      <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => scegli(t)}
                                        className={`text-left px-2 py-1.5 text-xs rounded hover:bg-neutral-50 ${scelto?.value === t.value ? "bg-neutral-100 font-medium" : "text-neutral-700"}`}
                                      >
                                        {t.label}
                                      </button>
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {scelto && (
        <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">{scelto.label}</p>
            <button type="button" onClick={azzeraScelta} className="text-xs text-neutral-600 hover:text-neutral-700">✕ cambia modello</button>
          </div>

          {lineaRealeDiTipologiaKopen(scelto.value) && galleriaKopenPerTipologia(scelto.value) && (
            <div className="mb-3 bg-white border border-neutral-200 rounded-lg p-2.5">
              <p className="text-xs font-bold text-neutral-700 mb-0.5">
                Modelli reali Kopen — linea {KOPEN_LINEA_NOME[lineaRealeDiTipologiaKopen(scelto.value)!]}
              </p>
              <p className="text-[11px] text-neutral-600 mb-2">
                Foto ufficiali dal sito Kopen per riconoscere il disegno del pannello — clicca una foto per aprire la scheda reale del modello.
              </p>
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {galleriaKopenPerTipologia(scelto.value)!.map((m) => (
                  <a
                    key={m.codice}
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 w-20 text-center group"
                    title={`Apri la scheda reale di ${m.codice} su kopendoors.com`}
                  >
                    <img
                      src={m.immagineUrl}
                      alt={m.codice}
                      className="w-20 h-20 object-cover rounded border border-neutral-200 group-hover:border-neutral-400"
                    />
                    <span className="text-[10px] text-neutral-600 block mt-0.5">{m.codice}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {scelto.haMisura ? (
            <>
              {scelto.misure && (
                <p className="text-xs mb-2">
                  <span className="font-bold text-neutral-700">
                    Misure di produzione: {etichetteDimensioni(scelto.value).larghezza.toLowerCase()}{" "}
                    {scelto.misure.larghezzaMin === scelto.misure.larghezzaMax
                      ? `esattamente ${scelto.misure.larghezzaMax}`
                      : `${scelto.misure.larghezzaMin}–${scelto.misure.larghezzaMax}`}{" "}
                    {unitaMisura(scelto.value)}
                    {" "}· {etichetteDimensioni(scelto.value).altezza.toLowerCase()}{" "}
                    {scelto.misure.altezzaMin === scelto.misure.altezzaMax
                      ? `esattamente ${scelto.misure.altezzaMax}`
                      : `${scelto.misure.altezzaMin}–${scelto.misure.altezzaMax}`}{" "}
                    {unitaMisura(scelto.value)}
                  </span>
                </p>
              )}
              <form action={azionePerMisura} onSubmit={alSubmitMisura} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="preventivoId" value={preventivoId} />
                <input type="hidden" name="brandId" value={brandId} />
                <input type="hidden" name="tipologia" value={scelto.value} />
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-700">{etichetteDimensioni(scelto.value).larghezza} ({unitaMisura(scelto.value)})</label>
                  <input
                    name="larghezza"
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    placeholder="es. 380"
                    value={larghezzaVal}
                    onChange={(e) => {
                      setLarghezzaVal(e.target.value);
                      if (erroreMisura) setErroreMisura(null);
                    }}
                    className={`border rounded px-2 py-1.5 text-sm w-28 ${erroreMisura ? "border-red-300" : "border-neutral-200"}`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-700">{etichetteDimensioni(scelto.value).altezza} ({unitaMisura(scelto.value)})</label>
                  <input
                    name="altezza"
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    placeholder="es. 250"
                    value={altezzaVal}
                    onChange={(e) => {
                      setAltezzaVal(e.target.value);
                      if (erroreMisura) setErroreMisura(null);
                    }}
                    className={`border rounded px-2 py-1.5 text-sm w-28 ${erroreMisura ? "border-red-300" : "border-neutral-200"}`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-700">Quantità</label>
                  <input name="quantita" type="number" defaultValue={1} min={1} className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-20" />
                </div>
                <button className="btn-3d text-sm px-4 py-2" style={{ background: brandColor, color: "#fff", borderColor: brandColor }}>
                  Calcola e aggiungi
                </button>
                {erroreMisura && (
                  <div className="w-full flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs font-medium">
                    <span>⚠️</span>
                    <span>{erroreMisura}</span>
                  </div>
                )}
                <p className="text-[11px] text-neutral-600 w-full">
                  Il prezzo viene calcolato dalla fascia di listino più vicina alla misura inserita.
                </p>
              </form>
            </>
          ) : scelto.varianti && scelto.varianti.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] text-neutral-600 mb-1">Prodotto a prezzo fisso (senza misura) — scegli la variante:</p>
              {scelto.varianti.map((v) => (
                <form key={v.id} action={azionePerProdotto} className="flex items-center justify-between gap-2 bg-white border border-neutral-200 rounded px-2 py-1.5">
                  <input type="hidden" name="preventivoId" value={preventivoId} />
                  <input type="hidden" name="prodottoId" value={v.id} />
                  <span className="text-xs flex-1">{v.colore} — {v.prezzoBase.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
                  <input name="quantita" type="number" defaultValue={1} min={1} className="border border-neutral-200 rounded px-1.5 py-1 text-xs w-16" />
                  <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">+ aggiungi</button>
                </form>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-600">Nessuna variante disponibile a listino per questo modello.</p>
          )}
        </div>
      )}
    </div>
  );
}
