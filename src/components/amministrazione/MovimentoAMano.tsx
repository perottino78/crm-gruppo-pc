"use client";

// Movimento a mano in prima nota con il «Chi» (richiesta di Rocco): si cerca la persona in anagrafica mentre si scrive;
// scelta, compaiono le sue fatture/scadenze da saldare (uscita → da pagare, entrata → da incassare). Quelle spuntate
// vengono saldate quando si registra il movimento; senza spunte è un movimento nuovo come prima.
import { useEffect, useMemo, useState } from "react";

type Conto = { id: string; nome: string };
type Risultato = { chiave: string; nome: string; info: string };
type Scad = { id: string; descrizione: string; numero: string | null; data: string | null; residuo: number; importo: number };

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-xs bg-white";
const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataIt = (d: string | null) => (d ? new Date(d).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "senza data");

export default function MovimentoAMano({ azione, conti, contoPredefinito, categorie, divisioni }: {
  azione: (fd: FormData) => void | Promise<void>; conti: Conto[]; contoPredefinito?: string; categorie: string[]; divisioni: string[];
}) {
  const [verso, setVerso] = useState("uscita");
  const [cerca, setCerca] = useState("");
  const [risultati, setRisultati] = useState<Risultato[]>([]);
  const [chi, setChi] = useState<Risultato | null>(null);
  const [scadenze, setScadenze] = useState<Scad[] | null>(null);
  const [spuntate, setSpuntate] = useState<string[]>([]);
  const [importo, setImporto] = useState("");
  const [importoAMano, setImportoAMano] = useState(false);

  // ricerca mentre si scrive (dopo 2 lettere, con una piccola attesa)
  useEffect(() => {
    if (chi || cerca.trim().length < 2) { setRisultati([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/amministrazione/chi?q=${encodeURIComponent(cerca.trim())}`).then((x) => x.json()).catch(() => ({ risultati: [] }));
      setRisultati(r.risultati ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [cerca, chi]);

  // scadenze aperte della persona scelta
  useEffect(() => {
    setSpuntate([]);
    if (!chi) { setScadenze(null); return; }
    let vivo = true;
    fetch(`/api/amministrazione/chi?scadenze=${encodeURIComponent(chi.chiave)}&tipo=${verso === "uscita" ? "PAGAMENTO" : "INCASSO"}`)
      .then((x) => x.json()).then((r) => vivo && setScadenze(r.scadenze ?? [])).catch(() => vivo && setScadenze([]));
    return () => { vivo = false; };
  }, [chi, verso]);

  const totaleSpuntate = useMemo(() => Math.round((scadenze ?? []).filter((s) => spuntate.includes(s.id)).reduce((t, s) => t + s.residuo, 0) * 100) / 100, [scadenze, spuntate]);
  // l'importo segue le fatture spuntate finché non lo si scrive a mano
  useEffect(() => { if (!importoAMano) setImporto(totaleSpuntate ? totaleSpuntate.toFixed(2).replace(".", ",") : ""); }, [totaleSpuntate, importoAMano]);

  const togli = () => { setChi(null); setCerca(""); setScadenze(null); };
  const spunta = (id: string) => setSpuntate((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  return (
    <form action={azione} className="grid md:grid-cols-6 gap-2 mt-3">
      <select name="contoId" required defaultValue={contoPredefinito} className={inp}>
        {conti.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <input type="date" name="data" required defaultValue={new Date().toISOString().slice(0, 10)} className={inp} />
      <select name="verso" value={verso} onChange={(e) => setVerso(e.target.value)} className={inp}><option value="uscita">Uscita</option><option value="entrata">Entrata</option></select>
      <input name="importo" required inputMode="decimal" placeholder="Importo €" value={importo} onChange={(e) => { setImporto(e.target.value); setImportoAMano(true); }} className={inp} />

      {/* Chi */}
      <div className="relative md:col-span-2">
        {chi ? (
          <div className="flex items-center justify-between gap-2 rounded border border-blue-300 bg-blue-50 px-2 py-1.5 text-xs">
            <span>👤 <b>{chi.nome}</b> <span className="text-neutral-500">· {chi.info}</span></span>
            <button type="button" onClick={togli} className="text-neutral-600 hover:text-red-600" title="Cambia">✕</button>
          </div>
        ) : (
          <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Chi? (cliente o fornitore)" className={`${inp} w-full`} autoComplete="off" />
        )}
        <input type="hidden" name="chi" value={chi?.chiave ?? ""} />
        <input type="hidden" name="chiNome" value={chi?.nome ?? ""} />
        {!chi && risultati.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg text-xs">
            {risultati.map((r) => (
              <li key={r.chiave}>
                <button type="button" onClick={() => { setChi(r); setRisultati([]); }} className="w-full text-left px-3 py-2 hover:bg-blue-50">
                  <b>{r.nome}</b> <span className="text-neutral-500">· {r.info}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {chi && scadenze && (
        <div className="md:col-span-6 rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-xs">
          {scadenze.length === 0 ? (
            <p className="text-neutral-600">{chi.nome} non ha {verso === "uscita" ? "fatture da pagare" : "importi da incassare"} aperti: si registra un movimento nuovo.</p>
          ) : (
            <>
              <p className="font-semibold text-neutral-800 mb-1">{verso === "uscita" ? "Fatture da pagare" : "Da incassare"} di {chi.nome}: spunta quelle che questo movimento salda</p>
              <ul className="space-y-1">
                {scadenze.map((s) => (
                  <li key={s.id}>
                    <label className={`flex items-center gap-2 rounded border px-2 py-1 cursor-pointer ${spuntate.includes(s.id) ? "border-green-400 bg-green-50" : "border-neutral-200 bg-white"}`}>
                      <input type="checkbox" name="scadenze" value={s.id} checked={spuntate.includes(s.id)} onChange={() => spunta(s.id)} />
                      <span className="flex-1">{s.numero ? <b>n. {s.numero} · </b> : null}{s.descrizione} <span className="text-neutral-500">· scade {dataIt(s.data)}</span></span>
                      <span className="font-semibold whitespace-nowrap">{eur(s.residuo)}{s.residuo < s.importo - 0.004 && <span className="text-neutral-500 font-normal"> di {eur(s.importo)}</span>}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {spuntate.length > 0 && <p className="mt-1 text-green-800">Spuntate {spuntate.length}: {eur(totaleSpuntate)}. Con «Registra» diventano saldate (anche in parte, se l&apos;importo è minore).</p>}
            </>
          )}
        </div>
      )}

      <input name="descrizione" placeholder={chi ? `Descrizione (vuota = «${verso === "uscita" ? "Pagamento" : "Incasso"} ${chi.nome}»)` : "Descrizione"} required={!chi} className={`${inp} md:col-span-2`} />
      <select name="categoria" className={`${inp} md:col-span-2`} disabled={spuntate.length > 0}>
        <option value="">{spuntate.length ? "— salda le fatture spuntate —" : "— da abbinare a una scadenza —"}</option>
        {categorie.map((c) => <option key={c}>{c}</option>)}
      </select>
      <select name="divisione" className={inp}><option value="">Divisione…</option>{divisioni.map((b) => <option key={b}>{b}</option>)}</select>
      <button className="btn-3d btn-3d-green text-xs">Registra</button>
      <p className="text-[11px] text-neutral-500 md:col-span-6">I movimenti delle banche non si scrivono a mano: si importano dall&apos;estratto conto.</p>
    </form>
  );
}
