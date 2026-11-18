"use client";

// Importazione dei lead da CSV in due passi: «Controlla» (nessun salvataggio, mostra nuovi, doppioni ed errori) e «Importa» (salva solo i nuovi).
import { useRef, useState } from "react";
import Link from "next/link";

type Esito = { riga: number; stato: "DOPPIO_FILE" | "DOPPIO_LEAD" | "DOPPIO_CLIENTE" | "ERRORE" | "NUOVO"; motivo?: string; nome: string; telefono: string; email: string };
type Risposta = {
  ok: boolean; errore?: string; creati?: number; avvisi?: string[]; colonneTrovate?: string[]; colonneNonCapite?: string[];
  riepilogo?: { totale: number; nuovi: number; doppiFile: number; doppiLead: number; doppiClienti: number; errori: number };
  esiti?: Esito[];
};
const ETICHETTA: Record<Esito["stato"], string> = { NUOVO: "Nuovo", DOPPIO_FILE: "Doppio nel file", DOPPIO_LEAD: "Già lead", DOPPIO_CLIENTE: "Già cliente", ERRORE: "Errore" };
const COLORE: Record<Esito["stato"], string> = { NUOVO: "bg-green-100 text-green-800", DOPPIO_FILE: "bg-amber-100 text-amber-800", DOPPIO_LEAD: "bg-amber-100 text-amber-800", DOPPIO_CLIENTE: "bg-blue-100 text-blue-800", ERRORE: "bg-red-100 text-red-800" };

export default function ImportaLead() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [r, setR] = useState<Risposta | null>(null);
  const [occupato, setOccupato] = useState<"" | "controllo" | "import">("");
  const [fatto, setFatto] = useState(false);

  async function invia(esegui: boolean, rapporto = false) {
    if (!file) return null;
    const fd = new FormData();
    fd.append("file", file); fd.append("esegui", esegui ? "1" : "0"); if (rapporto) fd.append("rapporto", "1");
    const res = await fetch("/api/lead/importa", { method: "POST", body: fd });
    return res;
  }
  async function controlla() {
    setOccupato("controllo"); setFatto(false); setR(null);
    try { const res = await invia(false); setR(res ? await res.json() : null); } catch { setR({ ok: false, errore: "Non sono riuscito a leggere il file. Riprova." }); }
    setOccupato("");
  }
  async function importa() {
    if (!r?.riepilogo || !confirm(`Importo ${r.riepilogo.nuovi} lead nuovi? I doppioni e gli errori restano fuori.`)) return;
    setOccupato("import");
    try { const res = await invia(true); const j: Risposta | null = res ? await res.json() : null; setR(j); setFatto(!!j?.ok); } catch { setR({ ok: false, errore: "L'importazione si è interrotta: ricontrolla il file, i lead già salvati non si ripetono." }); }
    setOccupato("");
  }
  async function scaricaRapporto() {
    const res = await invia(false, true);
    if (!res) return;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = "lead-non-importati.csv"; a.click(); URL.revokeObjectURL(url);
  }
  const rs = r?.riepilogo;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="mb-2 text-sm font-bold text-neutral-900">2 · Scegli il file compilato</p>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept=".csv,text/csv,.txt" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setR(null); setFatto(false); }} className="text-sm" />
          <button type="button" onClick={controlla} disabled={!file || !!occupato} className="btn-3d btn-3d-blue px-4 py-2 text-sm disabled:opacity-50">
            {occupato === "controllo" ? "Controllo…" : "🔍 Controlla il file"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">Il controllo non salva niente: ti dice quanti lead sono nuovi e quali sono già in ONE.</p>
      </div>

      {r && !r.ok && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">⛔ {r.errore}</p>}

      {r?.ok && rs && (
        <div className="space-y-3">
          {fatto ? (
            <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3">
              <p className="text-base font-bold text-green-900">✅ Importati {r.creati} lead</p>
              <p className="text-sm text-green-900">Sono nei «Task di oggi» della telefonista del marchio, da classificare. Non è partita nessuna email. Non importati: {rs.totale - (r.creati ?? 0)} (doppioni o errori).</p>
              <Link href="/lead" className="btn-3d btn-3d-green mt-2 inline-block px-4 py-2 text-sm">Vai ai lead →</Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {[["Righe lette", rs.totale, "bg-neutral-100"], ["Nuovi da importare", rs.nuovi, "bg-green-100"], ["Già lead o doppi nel file", rs.doppiLead + rs.doppiFile, "bg-amber-100"], ["Già clienti", rs.doppiClienti, "bg-blue-100"], ["Con errori", rs.errori, "bg-red-100"]].map(([t, n, c]) => (
                <div key={String(t)} className={`rounded-lg p-3 ${c}`}><p className="text-[11px] text-neutral-700">{t}</p><p className="text-2xl font-extrabold text-neutral-900">{n}</p></div>
              ))}
            </div>
          )}
          {r.avvisi?.map((a) => <p key={a} className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">⚠️ {a}</p>)}
          <p className="text-xs text-neutral-600">
            Colonne capite: <b>{r.colonneTrovate?.join(", ")}</b>.
            {r.colonneNonCapite && r.colonneNonCapite.length > 0 && <> Ignorate (nome non riconosciuto): {r.colonneNonCapite.join(", ")}.</>}
          </p>
          {!fatto && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={importa} disabled={rs.nuovi === 0 || !!occupato} className="btn-3d btn-3d-green px-5 py-2.5 text-sm disabled:opacity-50">
                {occupato === "import" ? "Importo…" : `✅ Importa ${rs.nuovi} lead nuovi`}
              </button>
              {(r.esiti?.length ?? 0) > 0 && <button type="button" onClick={scaricaRapporto} className="btn-3d btn-3d-outline px-3 py-2 text-xs">⬇️ Scarica l&apos;elenco dei non importati</button>}
            </div>
          )}
          {(r.esiti?.length ?? 0) > 0 && (
            <details className="rounded-lg border border-neutral-200 bg-white" open={(r.esiti?.length ?? 0) <= 15}>
              <summary className="cursor-pointer px-4 py-2 text-sm font-bold text-neutral-900">Righe non importate ({r.esiti?.length})</summary>
              <div className="max-h-96 overflow-auto px-4 pb-3">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-neutral-500"><th className="py-1 pr-2">Riga</th><th className="pr-2">Esito</th><th className="pr-2">Nome</th><th className="pr-2">Contatto</th><th>Perché</th></tr></thead>
                  <tbody>
                    {r.esiti?.slice(0, 300).map((e) => (
                      <tr key={e.riga} className="border-t border-neutral-100 align-top">
                        <td className="py-1 pr-2">{e.riga}</td>
                        <td className="pr-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${COLORE[e.stato]}`}>{ETICHETTA[e.stato]}</span></td>
                        <td className="pr-2">{e.nome || "—"}</td><td className="pr-2">{[e.telefono, e.email].filter(Boolean).join(" · ") || "—"}</td><td className="text-neutral-600">{e.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(r.esiti?.length ?? 0) > 300 && <p className="mt-1 text-[11px] text-neutral-500">Mostro le prime 300: l&apos;elenco da scaricare le ha tutte.</p>}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
