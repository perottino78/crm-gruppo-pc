"use client";

import { useState, useTransition } from "react";
import { anteprimaFoglio, confermaFoglio, type AnteprimaFoglio, type EsitoImport } from "@/app/amministrazione-actions";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" as unknown as boolean });
const dataIt = (s: string) => s.split("-").reverse().join("/");

async function leggiTesto(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { return new TextDecoder("windows-1252").decode(buf); }
}

export default function ImportaFoglio({ conti }: { conti: { id: string; nome: string }[] }) {
  const [contoId, setContoId] = useState(conti[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [testo, setTesto] = useState("");
  const [dataApertura, setDataApertura] = useState("2025-12-31");
  const [imposta, setImposta] = useState(true);
  const [a, setA] = useState<AnteprimaFoglio | null>(null);
  const [esito, setEsito] = useState<EsitoImport | null>(null);
  const [inCorso, avvia] = useTransition();

  const analizza = (f: File | null, conto = contoId, data = dataApertura) => {
    setA(null); setEsito(null);
    if (!f || !conto) return;
    if (/\.(xlsx|xls|ods|pdf)$/i.test(f.name)) {
      setEsito({ ok: false, messaggio: "Serve il foglio in CSV: in Google Fogli «File → Scarica → Valori separati da virgola (.csv)» sul foglio dell'anno; in Excel «Salva con nome» → CSV." });
      return;
    }
    avvia(async () => {
      const t = await leggiTesto(f);
      setTesto(t);
      const r = await anteprimaFoglio(conto, t, data);
      setA(r);
      setImposta(r.contoSenzaMovimenti);
    });
  };

  const conferma = () => avvia(async () => {
    const r = await confermaFoglio(contoId, testo, file?.name ?? "foglio.csv", imposta && !!a?.contoSenzaMovimenti, dataApertura);
    setEsito(r);
    if (r.ok) { setA(null); setFile(null); }
  });

  const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs font-semibold">Conto
          <select value={contoId} onChange={(e) => { setContoId(e.target.value); analizza(file, e.target.value); }} className={`${inp} block`}>
            {conti.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">Foglio della prima nota (CSV)
          <input type="file" accept=".csv,.txt,text/csv" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); analizza(f); }} className="block text-sm" />
        </label>
        {inCorso && <span className="text-sm text-neutral-500">Analisi in corso…</span>}
      </div>

      {esito && <div className={`rounded p-3 text-sm ${esito.ok ? (esito.quadratura === "DIFFERENZA" ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-900") : "bg-red-50 text-red-800"}`}>
        {esito.messaggio}
        {esito.ok && esito.quadratura === "OK" && <div className="font-semibold mt-1">✓ Quadratura: il saldo del CRM coincide al centesimo con il totale finale del foglio.</div>}
        {esito.ok && esito.quadratura === "DIFFERENZA" && <div className="font-semibold mt-1">⚠ Il saldo del CRM differisce dal totale del foglio di {eur(esito.differenza ?? 0)}: controlla il saldo iniziale del conto.</div>}
      </div>}

      {a && !a.ok && <div className="rounded p-3 text-sm bg-red-50 text-red-800">{a.errore}</div>}
      {a?.ok && (
        <div className="border border-neutral-200 rounded-lg p-3 space-y-3 text-sm">
          <div className="grid md:grid-cols-4 gap-2">
            <Box t="Movimenti nel foglio" v={`${a.movimenti}`} s={a.periodo ? `dal ${dataIt(a.periodo.da)} al ${dataIt(a.periodo.a)}` : ""} />
            <Box t="Da importare" v={`${a.nuovi}`} s={`${a.doppioni} già presenti${a.inMesiChiusi ? ` · ${a.inMesiChiusi} in mesi chiusi` : ""}${a.primaDelSaldo ? ` · ${a.primaDelSaldo} prima del saldo iniziale` : ""}`} />
            <Box t="Entrate / uscite" v={`${eur(a.entrate)}`} s={eur(a.uscite)} />
            <Box t="Saldo finale foglio" v={a.saldoFinaleFoglio === null ? "—" : eur(a.saldoFinaleFoglio)} s={a.saldoCalcolatoFoglio === a.saldoFinaleFoglio ? "✓ il foglio è coerente" : `ricalcolato ${eur(a.saldoCalcolatoFoglio ?? 0)}`} />
          </div>

          {a.salti.length > 0 && <div className="bg-red-50 text-red-800 rounded p-2">
            <b>Il totale progressivo ha {a.salti.length} salti</b>: l&apos;importazione è bloccata finché il foglio non è corretto.
            <ul className="text-xs mt-1">{a.salti.map((s) => <li key={s.riga}>riga {s.riga}: atteso {eur(s.atteso)}, nel foglio {eur(s.foglio)} (differenza {eur(s.differenza)})</li>)}</ul>
          </div>}

          {a.aperturaFoglio && (
            <div className="bg-neutral-50 rounded p-2">
              <div>Saldo di apertura nel foglio: <b>{eur(a.aperturaFoglio.importo)}</b> <span className="text-neutral-500">(«{a.aperturaFoglio.etichetta}»)</span></div>
              <div>Saldo iniziale del conto nel CRM: <b>{eur(a.saldoInizialeConto)}</b> al {dataIt(a.dataSaldoInizialeConto)}</div>
              {a.contoSenzaMovimenti ? (
                <label className="flex flex-wrap items-center gap-2 mt-1">
                  <input type="checkbox" checked={imposta} onChange={(e) => setImposta(e.target.checked)} />
                  Usa il saldo di apertura del foglio come saldo iniziale del conto, alla data
                  <input type="date" value={dataApertura} onChange={(e) => { setDataApertura(e.target.value); analizza(file, contoId, e.target.value); }} className={inp} />
                </label>
              ) : Math.abs(a.aperturaFoglio.importo - a.saldoInizialeConto) > 0.005 && <div className="text-amber-800 text-xs mt-1">Il conto ha già movimenti: il saldo iniziale non viene cambiato. Se la quadratura non torna, correggilo a mano nella sezione Conti.</div>}
            </div>
          )}

          <div>
            <div className="font-semibold mb-1">Come verranno classificati</div>
            <table className="text-xs w-full"><tbody>
              {a.categorie.map((c) => <tr key={c.categoria} className="border-t border-neutral-100"><td className="py-1">{c.categoria}</td><td className="py-1 text-right">{c.n}</td><td className="py-1 text-right w-32">{eur(c.totale)}</td></tr>)}
            </tbody></table>
            <p className="text-xs text-neutral-500 mt-1">Le spese bancarie, ritenute, F24, cessioni e stipendi si registrano da soli. Gli incassi dai clienti e i pagamenti ai fornitori restano «da abbinare» alle scadenze.</p>
          </div>

          {a.programmate.length > 0 && <div>
            <div className="font-semibold mb-1">Righe senza totale → scadenzario ({a.programmate.filter((p) => !p.giaPresente).length} nuove)</div>
            <table className="text-xs w-full"><tbody>
              {a.programmate.map((p, i) => <tr key={i} className="border-t border-neutral-100">
                <td className="py-1 pr-2 whitespace-nowrap">{dataIt(p.data)}</td><td className="py-1 pr-2">{p.descrizione}</td>
                <td className="py-1 pr-2 text-right whitespace-nowrap">{eur(p.importo)}</td>
                <td className="py-1 whitespace-nowrap">{p.giaPresente ? "già presente" : p.passata ? <span className="text-amber-700">da verificare</span> : "programmata"}</td>
              </tr>)}
            </tbody></table>
          </div>}

          <button disabled={inCorso || a.salti.length > 0 || (a.nuovi === 0 && a.programmate.every((p) => p.giaPresente))} onClick={conferma} className="btn-3d btn-3d-green text-sm disabled:opacity-50">
            Conferma importazione
          </button>
        </div>
      )}
    </div>
  );
}

function Box({ t, v, s }: { t: string; v: string; s: string }) {
  return <div className="bg-neutral-50 rounded p-2"><div className="text-xs text-neutral-500">{t}</div><div className="font-bold">{v}</div><div className="text-xs text-neutral-500">{s}</div></div>;
}
