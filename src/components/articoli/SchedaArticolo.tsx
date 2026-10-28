"use client";

import { useActionState, useRef, useState } from "react";
import { salvaArticolo, type EsitoArticolo } from "@/app/articoli-actions";
import { calcolaArticolo, leggiNumero, euro, perc, testoRegola, UNITA, ALIQUOTE, METODI, type CategoriaRegola } from "@/lib/articoli/prezzi";

type Art = {
  id?: string; codice?: string; codiceFornitore?: string | null; ean?: string | null; descrizione?: string; descrizioneEstesa?: string | null;
  divisione?: string | null; categoriaId?: string | null; fornitoreId?: string | null; marca?: string | null; um?: string; aliquotaIva?: number;
  prezzoListino?: number | null; sconti?: string | null; costoAcquisto?: number | null; metodoPrezzo?: string | null; valorePrezzo?: number | null;
  prezzoVendita?: number | null; immagineUrl?: string | null; note?: string | null; attivo?: boolean;
};
type Props = {
  articolo: Art; categorie: (CategoriaRegola & { etichetta: string })[]; fornitori: { id: string; ragioneSociale: string; scontoFornitore: number | null }[];
  divisioni: string[]; modificabile: boolean; aiAttiva: boolean;
};

const inp = "border border-neutral-300 rounded px-2 py-1 text-sm w-full disabled:bg-neutral-50";
const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

export default function SchedaArticolo({ articolo: a, categorie, fornitori, divisioni, modificabile, aiAttiva }: Props) {
  const [esito, azione, inCorso] = useActionState<EsitoArticolo, FormData>(salvaArticolo, null);
  const form = useRef<HTMLFormElement>(null);
  const leggi = () => {
    const fd = new FormData(form.current ?? undefined);
    const s = (k: string) => String(fd.get(k) ?? "").trim() || null;
    return {
      prezzoListino: leggiNumero(s("prezzoListino")), sconti: s("sconti"), costoAcquisto: leggiNumero(s("costoAcquisto")),
      metodoPrezzo: s("metodoPrezzo"), valorePrezzo: leggiNumero(s("valorePrezzo")), prezzoVendita: leggiNumero(s("prezzoVendita")),
      categoriaId: s("categoriaId"), aliquotaIva: leggiNumero(s("aliquotaIva")) ?? 22, fornitoreId: s("fornitoreId"),
    };
  };
  const [val, setVal] = useState(() => ({ ...a, aliquotaIva: a.aliquotaIva ?? 22 }));
  const c = calcolaArticolo(val, categorie);
  const metodo = val.metodoPrezzo ?? "";
  const conListino = val.prezzoListino !== null && val.prezzoListino !== undefined;
  const fornitore = fornitori.find((f) => f.id === val.fornitoreId);
  const [ai, setAi] = useState<{ stato: "" | "attesa" | "ok" | "errore"; testo: string }>({ stato: "", testo: "" });

  const imposta = (nome: string, valore: string) => {
    const el = form.current?.elements.namedItem(nome) as HTMLInputElement | HTMLSelectElement | null;
    if (el && valore) el.value = valore;
  };
  async function fotoAi(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAi({ stato: "attesa", testo: "L'AI sta guardando la foto…" });
    const fd = new FormData();
    fd.append("azione", "foto");
    fd.append("file", f);
    try {
      const r = await fetch("/api/articoli/ai", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) { setAi({ stato: "errore", testo: j.errore ?? "Errore AI" }); return; }
      const p = j.proposta as Record<string, string>;
      const cerca = (nome: string) => categorie.find((x) => x.etichetta.toLowerCase() === nome.toLowerCase()) ?? categorie.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
      const catTrovata = (p.sottocategoria && cerca(`${p.categoria} › ${p.sottocategoria}`)) || (p.categoria && cerca(p.categoria));
      const descrAttuale = (form.current?.elements.namedItem("descrizione") as HTMLInputElement | null)?.value;
      if (!descrAttuale) imposta("descrizione", p.descrizione ?? "");
      imposta("descrizioneEstesa", p.descrizioneEstesa ?? "");
      imposta("marca", p.marca ?? "");
      imposta("codiceFornitore", p.codiceFornitore ?? "");
      imposta("ean", p.ean ?? "");
      if (p.um && UNITA.includes(p.um)) imposta("um", p.um);
      if (catTrovata) imposta("categoriaId", catTrovata.id);
      setVal({ ...val, ...leggi() });
      const nuovaCat = !catTrovata && p.categoria ? ` Categoria proposta «${p.categoria}${p.sottocategoria ? ` › ${p.sottocategoria}` : ""}» non esiste ancora: creala in Categorie e ricarichi se ti serve.` : "";
      setAi({ stato: "ok", testo: `Campi compilati dall'AI: controllali prima di salvare.${descrAttuale && p.descrizione ? ` Descrizione proposta: «${p.descrizione}».` : ""}${nuovaCat}${p.note ? ` Note dell'AI: ${p.note}` : ""}` });
    } catch {
      setAi({ stato: "errore", testo: "Collegamento non riuscito: riprova." });
    }
    e.target.value = "";
  }

  return (
    <form ref={form} action={azione} onChange={() => setVal({ ...val, ...leggi() })} className="grid lg:grid-cols-3 gap-4">
      {a.id && <input type="hidden" name="id" value={a.id} />}
      <fieldset disabled={!modificabile} className="lg:col-span-2 space-y-4">
        <section className="bg-white border border-neutral-200 rounded-lg p-4 grid md:grid-cols-6 gap-3 text-sm">
          <h2 className="md:col-span-6 font-bold flex flex-wrap items-center justify-between gap-2">
            Dati articolo
            {modificabile && aiAttiva && (
              <label className="btn-3d btn-3d-teal text-xs px-2 py-1 cursor-pointer font-normal">
                ✨ Compila da foto con AI
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={fotoAi} />
              </label>
            )}
          </h2>
          {ai.stato && <p className={`md:col-span-6 text-xs rounded px-2 py-1.5 ${ai.stato === "errore" ? "bg-red-50 text-red-900" : ai.stato === "ok" ? "bg-teal-50 text-teal-900" : "bg-neutral-100"}`}>{ai.testo}</p>}
          <label className="md:col-span-2">Codice interno<input name="codice" defaultValue={a.codice} placeholder={a.id ? "" : "vuoto = automatico"} className={`${inp} font-mono uppercase`} /></label>
          <label className="md:col-span-2">Codice fornitore<input name="codiceFornitore" defaultValue={a.codiceFornitore ?? ""} className={`${inp} font-mono`} /></label>
          <label className="md:col-span-2">EAN / codice a barre<input name="ean" defaultValue={a.ean ?? ""} className={`${inp} font-mono`} /></label>
          <label className="md:col-span-6">Descrizione *<input name="descrizione" required defaultValue={a.descrizione} className={inp} /></label>
          <label className="md:col-span-6">Descrizione estesa / caratteristiche<textarea name="descrizioneEstesa" defaultValue={a.descrizioneEstesa ?? ""} rows={2} className={inp} /></label>
          <label className="md:col-span-3">Categoria
            <select name="categoriaId" defaultValue={a.categoriaId ?? ""} className={inp}>
              <option value="">— nessuna —</option>
              {categorie.map((x) => <option key={x.id} value={x.id}>{x.etichetta}{x.metodoPrezzo ? ` (${testoRegola({ metodo: x.metodoPrezzo, valore: x.valore })})` : ""}</option>)}
            </select>
          </label>
          <label className="md:col-span-3">Fornitore
            <select name="fornitoreId" defaultValue={a.fornitoreId ?? ""} className={inp}>
              <option value="">— nessuno —</option>
              {fornitori.map((f) => <option key={f.id} value={f.id}>{f.ragioneSociale}</option>)}
            </select>
          </label>
          <label className="md:col-span-2">Marca<input name="marca" defaultValue={a.marca ?? ""} className={inp} /></label>
          <label className="md:col-span-2">Divisione
            <select name="divisione" defaultValue={a.divisione ?? ""} className={inp}><option value="">—</option>{divisioni.map((d) => <option key={d}>{d}</option>)}</select>
          </label>
          <label>UM<select name="um" defaultValue={a.um ?? "pz"} className={inp}>{UNITA.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>IVA %<select name="aliquotaIva" defaultValue={String(a.aliquotaIva ?? 22)} className={inp}>{ALIQUOTE.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        </section>

        <section className="bg-white border border-neutral-200 rounded-lg p-4 grid md:grid-cols-6 gap-3 text-sm">
          <h2 className="md:col-span-6 font-bold">Acquisto</h2>
          <label className="md:col-span-2">Prezzo di listino fornitore €<input name="prezzoListino" inputMode="decimal" defaultValue={n(a.prezzoListino)} className={inp} /></label>
          <label className="md:col-span-2">Sconti a cascata<input name="sconti" defaultValue={a.sconti ?? ""} placeholder={fornitore?.scontoFornitore ? `es. ${n(fornitore.scontoFornitore)} (sconto fornitore)` : "es. 50+10"} className={inp} /></label>
          <label className="md:col-span-2">Costo netto €
            {conListino
              ? <input value={c.costo === null ? "" : n(c.costo)} readOnly className={`${inp} bg-neutral-50`} title="Calcolato da listino e sconti" />
              : <input name="costoAcquisto" inputMode="decimal" defaultValue={n(a.costoAcquisto)} className={inp} />}
          </label>
          <p className="md:col-span-6 text-xs text-neutral-500">Con il listino il costo si calcola dagli sconti (50+10 = 55% di sconto). Senza listino scrivi direttamente il costo netto.</p>
        </section>

        <section className="bg-white border border-neutral-200 rounded-lg p-4 grid md:grid-cols-6 gap-3 text-sm">
          <h2 className="md:col-span-6 font-bold">Vendita</h2>
          <label className="md:col-span-3">Regola di prezzo
            <select name="metodoPrezzo" defaultValue={metodo} className={inp}>
              <option value="">Come la categoria{c.regola && c.regola.da !== "articolo" ? ` (${testoRegola(c.regola)})` : ""}</option>
              {METODI.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
          </label>
          {(metodo === "RICARICO" || metodo === "MARGINE") && (
            <label className="md:col-span-3">{metodo === "RICARICO" ? "Coefficiente (es. 3,3)" : "Margine % (es. 40)"}<input name="valorePrezzo" inputMode="decimal" defaultValue={n(a.valorePrezzo)} className={inp} /></label>
          )}
          {(metodo === "MANUALE" || !c.regola) && (
            <label className="md:col-span-3">Prezzo di vendita € (IVA esclusa)<input name="prezzoVendita" inputMode="decimal" defaultValue={n(a.prezzoVendita)} className={inp} /></label>
          )}
          {!c.regola && metodo === "" && <p className="md:col-span-6 text-xs text-amber-800">La categoria non ha una regola: scrivi il prezzo a mano o scegli un ricarico/margine.</p>}
        </section>

        <section className="bg-white border border-neutral-200 rounded-lg p-4 grid md:grid-cols-6 gap-3 text-sm">
          <label className="md:col-span-4">Immagine (indirizzo web)<input name="immagineUrl" defaultValue={a.immagineUrl ?? ""} placeholder="https://… oppure carica la foto qui sotto" className={inp} /></label>
          <label className="md:col-span-2 flex items-center gap-2 mt-5"><input type="checkbox" name="attivo" value="1" defaultChecked={a.attivo ?? true} /> Articolo attivo</label>
          <label className="md:col-span-6">Note<textarea name="note" defaultValue={a.note ?? ""} rows={2} className={inp} /></label>
        </section>
      </fieldset>

      <aside className="space-y-3">
        <section className="bg-white border-2 border-purple-200 rounded-lg p-4 text-sm lg:sticky lg:top-4">
          <h2 className="font-bold mb-2">Calcolo prezzo</h2>
          <dl className="grid grid-cols-2 gap-y-1">
            {conListino && <><dt className="text-neutral-500">Listino</dt><dd className="text-right">{euro(val.prezzoListino)}</dd></>}
            {conListino && val.sconti && <><dt className="text-neutral-500">Sconti</dt><dd className="text-right">−{val.sconti}</dd></>}
            <dt className="text-neutral-500">Costo netto</dt><dd className="text-right font-medium">{euro(c.costo)}</dd>
            <dt className="text-neutral-500">Regola</dt><dd className="text-right">{c.regola ? `${testoRegola(c.regola)}${c.regola.da !== "articolo" ? ` · ${c.regola.da}` : ""}` : "nessuna"}</dd>
            {c.regola?.arrotondamento ? <><dt className="text-neutral-500">Arrotondamento</dt><dd className="text-right">a {n(c.regola.arrotondamento)} €</dd></> : null}
            <dt className="text-neutral-700 font-bold border-t border-neutral-200 pt-1 mt-1">Vendita</dt><dd className="text-right text-lg font-bold border-t border-neutral-200 pt-1 mt-1">{euro(c.vendita)}</dd>
            <dt className="text-neutral-500">IVA {val.aliquotaIva}% inclusa</dt><dd className="text-right">{euro(c.ivato)}</dd>
            <dt className="text-neutral-500">Margine</dt><dd className={`text-right font-medium ${c.margine !== null && (c.margine < 0 || c.sottoMinimo) ? "text-red-700" : "text-green-800"}`}>{perc(c.margine)}</dd>
            <dt className="text-neutral-500">Ricarico</dt><dd className="text-right">{c.coefficiente !== null ? `×${n(c.coefficiente)}` : "—"}</dd>
          </dl>
          {c.sottoMinimo && <p className="mt-2 text-xs text-red-700">Margine sotto il minimo della categoria ({n(c.regola?.margineMinimo)}%).</p>}
          {modificabile && (
            <button disabled={inCorso} className="btn-3d btn-3d-purple w-full mt-3 text-sm py-2">{inCorso ? "Salvataggio…" : a.id ? "Salva modifiche" : "Crea articolo"}</button>
          )}
          {esito && <p className={`mt-2 text-xs ${esito.ok ? "text-green-800" : "text-red-700"}`}>{esito.messaggio}</p>}
        </section>
      </aside>
    </form>
  );
}
