"use client";

import { useState, useTransition } from "react";
import { anteprimaImport, confermaImport, type AnteprimaImport, type EsitoImport } from "@/app/amministrazione-actions";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" as unknown as boolean });
const dataIt = (s: string) => s.split("-").reverse().join("/");

async function leggiTesto(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // molti home banking esportano in Windows-1252 (accenti, simbolo €)
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export default function ImportaEstratto({ conti }: { conti: { id: string; nome: string }[] }) {
  const [contoId, setContoId] = useState(conti[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [testo, setTesto] = useState("");
  const [saldo, setSaldo] = useState("");
  const [anteprima, setAnteprima] = useState<AnteprimaImport | null>(null);
  const [esito, setEsito] = useState<EsitoImport | null>(null);
  const [inCorso, avvia] = useTransition();

  const reset = () => { setAnteprima(null); setEsito(null); };

  const analizza = (f: File | null, conto = contoId) => {
    reset();
    if (!f || !conto) return;
    if (/\.(xlsx|xls|pdf)$/i.test(f.name)) {
      setAnteprima({ ok: false, errore: "Questo è un file Excel o PDF: dall'home banking scegli l'esportazione in CSV (oppure apri il file in Excel e «Salva con nome» → CSV).", totaleRighe: 0, nuove: 0, doppioni: 0, inMesiChiusi: 0, scartate: [], esempio: [], totEntrate: 0, totUscite: 0, saldoAttuale: 0, saldoDopo: 0 });
      return;
    }
    avvia(async () => {
      const t = await leggiTesto(f);
      setTesto(t);
      setAnteprima(await anteprimaImport(conto, t));
    });
  };

  const conferma = () => {
    if (!file || !anteprima?.ok) return;
    const s = saldo.trim() ? Number(saldo.replace(/\./g, "").replace(",", ".")) : null;
    avvia(async () => {
      setEsito(await confermaImport(contoId, testo, file.name, s !== null && isFinite(s) ? s : null));
      setAnteprima(null);
      setFile(null);
      setSaldo("");
    });
  };

  if (!conti.length) return <p className="text-sm text-neutral-500">Crea prima almeno un conto.</p>;

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-3 gap-2">
        <label className="text-xs font-semibold">Conto
          <select value={contoId} onChange={(e) => { setContoId(e.target.value); analizza(file, e.target.value); }} className="block w-full border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white mt-0.5">
            {conti.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">File estratto conto (CSV)
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); analizza(f); }} className="block w-full text-sm mt-0.5" />
        </label>
        <label className="text-xs font-semibold">Saldo finale indicato dalla banca (consigliato)
          <input value={saldo} onChange={(e) => setSaldo(e.target.value)} inputMode="decimal" placeholder="es. 19.938,08" className="block w-full border border-neutral-300 rounded px-2 py-1.5 text-sm mt-0.5" />
        </label>
      </div>
      <p className="text-[11px] text-neutral-500">Puoi ricaricare lo stesso file o periodi che si sovrappongono: i movimenti già presenti vengono riconosciuti e saltati. Il saldo finale serve per la verifica di quadratura.</p>

      {inCorso && <p className="text-sm text-neutral-600">Elaborazione in corso…</p>}

      {anteprima && !anteprima.ok && <div className="bg-red-50 border border-red-300 text-red-900 rounded p-3 text-sm">{anteprima.errore}</div>}

      {anteprima?.ok && (
        <div className="border border-neutral-300 rounded-lg p-3 space-y-2 bg-neutral-50">
          <p className="text-sm"><b>Colonne riconosciute:</b> data = «{anteprima.colonne?.data}»
            {anteprima.colonne?.importo && <> · importo = «{anteprima.colonne.importo}»</>}
            {anteprima.colonne?.entrate && <> · entrate = «{anteprima.colonne.entrate}»</>}
            {anteprima.colonne?.uscite && <> · uscite = «{anteprima.colonne.uscite}»</>}
            {!!anteprima.colonne?.descrizione.length && <> · descrizione = «{anteprima.colonne.descrizione.join(" + ")}»</>}
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>Periodo {anteprima.periodo && `${dataIt(anteprima.periodo.da)} – ${dataIt(anteprima.periodo.a)}`}</span>
            <span><b>{anteprima.nuove}</b> nuovi</span>
            <span>{anteprima.doppioni} già presenti (saltati)</span>
            {anteprima.inMesiChiusi > 0 && <span className="text-red-700">{anteprima.inMesiChiusi} in mesi chiusi (saltati)</span>}
            {anteprima.scartate.length > 0 && <span className="text-neutral-600">{anteprima.scartate.length} righe ignorate</span>}
            <span className="text-green-700">+{eur(anteprima.totEntrate)}</span>
            <span className="text-orange-700">{eur(anteprima.totUscite)}</span>
            <span>Saldo conto: {eur(anteprima.saldoAttuale)} → <b>{eur(anteprima.saldoDopo)}</b></span>
          </div>
          {anteprima.errore && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">{anteprima.errore}</p>}
          <table className="w-full text-xs bg-white border border-neutral-200">
            <tbody>
              {anteprima.esempio.map((r, i) => (
                <tr key={i} className={`border-t ${r.doppione ? "text-neutral-400 line-through" : ""}`}>
                  <td className="px-2 py-1 whitespace-nowrap">{dataIt(r.data)}</td>
                  <td className="px-2 py-1">{r.descrizione}</td>
                  <td className={`px-2 py-1 text-right whitespace-nowrap font-semibold ${r.importo > 0 ? "text-green-700" : "text-orange-700"}`}>{eur(r.importo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {anteprima.scartate.length > 0 && (
            <details className="text-xs"><summary className="cursor-pointer">Righe ignorate</summary>
              <ul className="mt-1 space-y-0.5">{anteprima.scartate.map((s) => <li key={s.riga}>riga {s.riga}: {s.motivo} — <span className="text-neutral-500">{s.testo}</span></li>)}</ul>
            </details>
          )}
          <button onClick={conferma} disabled={inCorso || anteprima.nuove === 0} className="btn-3d btn-3d-green text-sm px-4 disabled:opacity-50">
            {anteprima.nuove ? `Importa ${anteprima.nuove} movimenti` : "Niente di nuovo da importare"}
          </button>
        </div>
      )}

      {esito && (
        <div className={`rounded p-3 text-sm border ${!esito.ok ? "bg-red-50 border-red-300 text-red-900" : esito.quadratura === "DIFFERENZA" ? "bg-red-50 border-red-300 text-red-900" : "bg-green-50 border-green-300 text-green-900"}`}>
          <p>{esito.messaggio}</p>
          {esito.quadratura === "OK" && <p className="font-bold mt-1">✓ Quadratura OK: il saldo del CRM coincide con quello della banca.</p>}
          {esito.quadratura === "DIFFERENZA" && <p className="font-bold mt-1">✗ Quadratura non riuscita: differenza di {eur(esito.differenza ?? 0)}. Controlla il saldo iniziale del conto o se manca un periodo di estratto.</p>}
          {esito.quadratura === "NON_VERIFICATA" && esito.ok && <p className="mt-1">Quadratura non verificata: la prossima volta indica il saldo finale della banca.</p>}
        </div>
      )}
    </div>
  );
}
