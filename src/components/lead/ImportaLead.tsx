"use client";

// Importazione di contatti da CSV, anche decine di migliaia di righe: il file si legge nel browser e si manda a pezzi (3.000 righe per volta).
// Due passi: «Controlla» (non salva) e «Importa» (salva solo i nuovi). Due destinazioni: solo campagne email (le telefoniste non li vedono) o lead da chiamare.
import { useState } from "react";
import Link from "next/link";
import { classifica, righeDaCsv, riepilogo, type Esito, type Modo, type RigaLead } from "@/lib/lead/importa";

type EsitoRiga = { riga: number; stato: Esito["stato"]; motivo?: string; nome: string; telefono: string; email: string };
type Totali = { totale: number; nuovi: number; doppiFile: number; doppiLead: number; doppiClienti: number; errori: number };
const PEZZO = 3000;
const ETICHETTA: Record<Esito["stato"], string> = { NUOVO: "Nuovo", DOPPIO_FILE: "Doppio nel file", DOPPIO_LEAD: "Già lead", DOPPIO_CLIENTE: "Già in anagrafica", ERRORE: "Errore" };
const COLORE: Record<Esito["stato"], string> = { NUOVO: "bg-green-100 text-green-800", DOPPIO_FILE: "bg-amber-100 text-amber-800", DOPPIO_LEAD: "bg-amber-100 text-amber-800", DOPPIO_CLIENTE: "bg-blue-100 text-blue-800", ERRORE: "bg-red-100 text-red-800" };

async function leggiFile(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { return new TextDecoder("windows-1252").decode(buf); } // CSV di Excel in italiano
}
const cella = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export default function ImportaLead() {
  const [file, setFile] = useState<File | null>(null);
  const [modo, setModo] = useState<Modo>("CAMPAGNE");
  const [righe, setRighe] = useState<RigaLead[] | null>(null);
  const [colonne, setColonne] = useState<{ trovate: string[]; ignorate: string[] } | null>(null);
  const [errore, setErrore] = useState("");
  const [lavoro, setLavoro] = useState<"" | "controllo" | "import">("");
  const [avanzamento, setAvanzamento] = useState(0);
  const [tot, setTot] = useState<Totali | null>(null);
  const [esiti, setEsiti] = useState<EsitoRiga[]>([]);
  const [avvisi, setAvvisi] = useState<string[]>([]);
  const [creati, setCreati] = useState<number | null>(null);

  function azzera() { setTot(null); setEsiti([]); setAvvisi([]); setCreati(null); setErrore(""); }

  async function scegli(f: File | null) {
    setFile(f); setRighe(null); setColonne(null); azzera();
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) { setErrore("Questo è un file Excel: aprilo e salvalo come «CSV (delimitato dal separatore di elenco)», poi caricalo qui."); return; }
    const l = righeDaCsv(await leggiFile(f));
    if (l.errore) { setErrore(l.errore); return; }
    setRighe(l.righe); setColonne({ trovate: l.colonneTrovate, ignorate: l.colonneNonCapite });
  }

  /** Manda le righe a pezzi al server; il controllo dei doppioni dentro il file lo fa il browser (una volta sola per tutto il file). */
  async function lavora(esegui: boolean) {
    if (!righe) return;
    azzera(); setLavoro(esegui ? "import" : "controllo"); setAvanzamento(0);
    try {
      const locali = classifica(righe, [], modo); // errori e doppioni dentro il file
      const daInviare = locali.filter((e) => e.stato === "NUOVO").map((e) => e.riga);
      const esitiLocali: EsitoRiga[] = locali.filter((e) => e.stato !== "NUOVO").map((e) => ({ riga: e.riga.riga, stato: e.stato, motivo: e.motivo, nome: e.riga.nome, telefono: e.riga.telefono, email: e.riga.email }));
      const somma = riepilogo(locali);
      const tutti: EsitoRiga[] = [...esitiLocali];
      let nuovi = 0, doppiLead = 0, doppiClienti = 0, errori = somma.errori, creatiTot = 0;
      const av = new Set<string>();
      for (let i = 0; i < daInviare.length; i += PEZZO) {
        const res = await fetch("/api/lead/importa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo, esegui, nomeFile: file?.name, righe: daInviare.slice(i, i + PEZZO) }) });
        const j = await res.json();
        if (!j.ok) throw new Error(j.errore || "Errore del server");
        nuovi += j.riepilogo.nuovi; doppiLead += j.riepilogo.doppiLead; doppiClienti += j.riepilogo.doppiClienti; errori += j.riepilogo.errori;
        tutti.push(...j.esiti); creatiTot += j.creati ?? 0; (j.avvisi ?? []).forEach((a: string) => av.add(a));
        setAvanzamento(Math.min(100, Math.round(((i + PEZZO) / Math.max(1, daInviare.length)) * 100)));
      }
      setTot({ totale: righe.length, nuovi, doppiFile: somma.doppiFile, doppiLead, doppiClienti, errori });
      setEsiti(tutti.sort((a, b) => a.riga - b.riga)); setAvvisi([...av]);
      if (esegui) setCreati(creatiTot);
    } catch (e) {
      setErrore(`${(e as Error).message}. ${esegui ? "Quello che era già stato salvato resta; rilancia l'importazione: i doppioni non si ripetono." : "Riprova."}`);
    }
    setLavoro(""); setAvanzamento(100);
  }

  function scarica() {
    const r = [["Riga", "Esito", "Motivo", "Nome", "Telefono", "Email"], ...esiti.map((e) => [String(e.riga), e.stato === "ERRORE" ? "Errore" : "Doppione", e.motivo ?? "", e.nome, e.telefono, e.email])];
    const blob = new Blob(["﻿" + r.map((x) => x.map(cella).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "contatti-non-importati.csv"; a.click(); URL.revokeObjectURL(a.href);
  }
  async function importa() {
    if (!tot || !confirm(`Importo ${tot.nuovi.toLocaleString("it-IT")} contatti nuovi? I doppioni e gli errori restano fuori.`)) return;
    await lavora(true);
  }

  const pronto = !!righe && !lavoro;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="mb-2 text-sm font-bold text-neutral-900">2 · Dove devono andare questi contatti?</p>
        <div className="grid gap-2 md:grid-cols-2">
          {([["CAMPAGNE", "📣 Solo per le campagne email", "Vanno in anagrafica come «Lead» con la provenienza indicata. Le telefoniste NON li vedono e nessuno li deve chiamare. Serve l'email."], ["TELEFONISTE", "📞 Lead da chiamare", "Entrano nei «Task di oggi» della telefonista del marchio, da classificare. Basta il telefono o l'email."]] as [Modo, string, string][]).map(([m, t, d]) => (
            <label key={m} className={`cursor-pointer rounded-lg border-2 p-3 ${modo === m ? "border-blue-500 bg-blue-50" : "border-neutral-200"}`}>
              <input type="radio" name="modo" checked={modo === m} onChange={() => { setModo(m); azzera(); }} className="mr-2" />
              <b className="text-sm">{t}</b><span className="mt-1 block text-xs text-neutral-600">{d}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="mb-2 text-sm font-bold text-neutral-900">3 · Scegli il file</p>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv,text/csv,.txt" onChange={(e) => scegli(e.target.files?.[0] ?? null)} className="text-sm" />
          <button type="button" onClick={() => lavora(false)} disabled={!pronto} className="btn-3d btn-3d-blue px-4 py-2 text-sm disabled:opacity-50">{lavoro === "controllo" ? `Controllo… ${avanzamento}%` : "🔍 Controlla il file"}</button>
        </div>
        {righe && <p className="mt-2 text-xs text-neutral-600">Letto: <b>{righe.length.toLocaleString("it-IT")}</b> righe. Colonne capite: <b>{colonne?.trovate.join(", ")}</b>.{colonne && colonne.ignorate.length > 0 && <> Ignorate: {colonne.ignorate.join(", ")}.</>}</p>}
        <p className="mt-1 text-[11px] text-neutral-500">Il controllo non salva niente. Va bene anche un file molto grande (decine di migliaia di righe): viene mandato a pezzi.</p>
      </div>

      {errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">⛔ {errore}</p>}
      {lavoro === "import" && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Importo… {avanzamento}% <div className="mt-1 h-2 rounded bg-blue-100"><div className="h-2 rounded bg-blue-600" style={{ width: `${avanzamento}%` }} /></div></div>}

      {tot && (
        <div className="space-y-3">
          {creati !== null ? (
            <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3">
              <p className="text-base font-bold text-green-900">✅ Importati {creati.toLocaleString("it-IT")} contatti</p>
              <p className="text-sm text-green-900">
                {modo === "CAMPAGNE" ? "Sono in anagrafica come «Lead»: li trovi nelle Campagne filtrando per tipo «Lead» e per provenienza. Le telefoniste non li vedono e non è partita nessuna email." : "Sono nei «Task di oggi» della telefonista del marchio, da classificare. Non è partita nessuna email."}
                {" "}Non importati: {(tot.totale - creati).toLocaleString("it-IT")} (doppioni o errori).
              </p>
              <Link href={modo === "CAMPAGNE" ? "/campagne" : "/lead"} className="btn-3d btn-3d-green mt-2 inline-block px-4 py-2 text-sm">{modo === "CAMPAGNE" ? "Vai alle campagne →" : "Vai ai lead →"}</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {[["Righe lette", tot.totale, "bg-neutral-100"], ["Nuovi da importare", tot.nuovi, "bg-green-100"], ["Già lead o doppi nel file", tot.doppiLead + tot.doppiFile, "bg-amber-100"], ["Già in anagrafica", tot.doppiClienti, "bg-blue-100"], ["Con errori", tot.errori, "bg-red-100"]].map(([t, n, c]) => (
                <div key={String(t)} className={`rounded-lg p-3 ${c}`}><p className="text-[11px] text-neutral-700">{t}</p><p className="text-2xl font-extrabold text-neutral-900">{Number(n).toLocaleString("it-IT")}</p></div>
              ))}
            </div>
          )}
          {avvisi.map((a) => <p key={a} className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">⚠️ {a}</p>)}
          {creati === null && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={importa} disabled={tot.nuovi === 0 || !!lavoro} className="btn-3d btn-3d-green px-5 py-2.5 text-sm disabled:opacity-50">{`✅ Importa ${tot.nuovi.toLocaleString("it-IT")} contatti nuovi`}</button>
              {esiti.length > 0 && <button type="button" onClick={scarica} className="btn-3d btn-3d-outline px-3 py-2 text-xs">⬇️ Scarica l&apos;elenco dei non importati</button>}
            </div>
          )}
          {esiti.length > 0 && (
            <details className="rounded-lg border border-neutral-200 bg-white" open={esiti.length <= 15}>
              <summary className="cursor-pointer px-4 py-2 text-sm font-bold text-neutral-900">Righe non importate ({esiti.length.toLocaleString("it-IT")})</summary>
              <div className="max-h-96 overflow-auto px-4 pb-3">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-neutral-500"><th className="py-1 pr-2">Riga</th><th className="pr-2">Esito</th><th className="pr-2">Nome</th><th className="pr-2">Contatto</th><th>Perché</th></tr></thead>
                  <tbody>
                    {esiti.slice(0, 300).map((e) => (
                      <tr key={e.riga} className="border-t border-neutral-100 align-top">
                        <td className="py-1 pr-2">{e.riga}</td>
                        <td className="pr-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${COLORE[e.stato]}`}>{ETICHETTA[e.stato]}</span></td>
                        <td className="pr-2">{e.nome || "—"}</td><td className="pr-2">{[e.telefono, e.email].filter(Boolean).join(" · ") || "—"}</td><td className="text-neutral-600">{e.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {esiti.length > 300 && <p className="mt-1 text-[11px] text-neutral-500">Mostro le prime 300: l&apos;elenco da scaricare le ha tutte.</p>}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
