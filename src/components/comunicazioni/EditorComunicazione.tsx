"use client";

import { useMemo, useState } from "react";
import { inviaComunicazione } from "@/app/comunicazioni-actions";
import { GRUPPI, MODELLI_COMUNICAZIONE, SEGNAPOSTO_COMUNICAZIONI, riempi, valoriPer, usaPassword, emailComunicazione, type Destinatario } from "@/lib/comunicazioni/testo";

const NOMI_RUOLO: Record<string, string> = {
  AMMINISTRATORE: "Amministratore", AMMINISTRATIVO: "Amministrazione", COMMERCIALE: "Commerciale", TELEFONISTA: "Telefonista",
  MARKETING: "Marketing", TECNICO: "Tecnico", POSATORE: "Posatore",
};

/** Scrive una comunicazione al team: a chi, cosa (anche dal modello «Invito a P&C ONE»), task facoltativo, anteprima. */
export default function EditorComunicazione({ utenti, admin, link, firmaHtml, mioId }: {
  utenti: Destinatario[]; admin: boolean; link: string; firmaHtml: string; mioId: string;
}) {
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const [modello, setModello] = useState("invito");
  const iniziale = MODELLI_COMUNICAZIONE.find((m) => m.chiave === "invito")!;
  const [oggetto, setOggetto] = useState(iniziale.oggetto);
  const [testo, setTesto] = useState(iniziale.testo);
  const [conTask, setConTask] = useState(!!iniziale.task);
  const [titoloTask, setTitoloTask] = useState(iniziale.task ?? "");
  const [password, setPassword] = useState(admin && !!iniziale.password);
  const [invio, setInvio] = useState(false);

  const cambiaModello = (k: string) => {
    const m = MODELLI_COMUNICAZIONE.find((x) => x.chiave === k)!;
    setModello(k); setOggetto(m.oggetto); setTesto(m.testo); setConTask(!!m.task); setTitoloTask(m.task ?? ""); setPassword(admin && !!m.password);
  };
  const tocca = (id: string) => setScelti((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const gruppo = (k: string) => {
    const g = GRUPPI.find((x) => x.chiave === k)!;
    setScelti((s) => { const n = new Set(s); utenti.filter(g.prende).forEach((d) => n.add(d.id)); return n; });
  };
  const esempio = utenti.find((d) => scelti.has(d.id)) ?? utenti.find((d) => d.id === mioId) ?? utenti[0];
  const passwordAttiva = password && usaPassword(testo);
  const anteprima = useMemo(() => {
    if (!esempio) return "";
    const v = valoriPer(esempio, { link, password: passwordAttiva ? "Pec-abcd23" : null });
    return emailComunicazione({ testo: riempi(testo, v), firmaHtml }).html;
  }, [esempio, testo, link, firmaHtml, passwordAttiva]);
  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

  return (
    <form action={inviaComunicazione} onSubmit={(e) => {
      const prova = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "1";
      if (!prova && !confirm(`Mandare la comunicazione a ${scelti.size} ${scelti.size === 1 ? "persona" : "persone"}?${passwordAttiva ? "\n\nAttenzione: a ognuno verrà data una password provvisoria nuova (quella di prima non funzionerà più)." : ""}`)) { e.preventDefault(); return; }
      setInvio(true);
    }} className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
      <div className="flex flex-col gap-3">
        <fieldset className="rounded-lg border border-neutral-200 bg-white p-3">
          <legend className="px-1 text-sm font-bold">👥 A chi ({scelti.size})</legend>
          <div className="mb-2 flex flex-wrap gap-1">
            {GRUPPI.map((g) => <button key={g.chiave} type="button" onClick={() => gruppo(g.chiave)} className="btn-3d btn-3d-outline px-2 py-1 text-xs">+ {g.nome}</button>)}
            <button type="button" onClick={() => setScelti(new Set())} className="px-2 py-1 text-xs text-red-700 underline">togli tutti</button>
          </div>
          <div className="grid max-h-72 gap-x-3 overflow-y-auto sm:grid-cols-2">
            {utenti.map((d) => (
              <label key={d.id} className="flex items-center gap-2 py-0.5 text-sm">
                <input type="checkbox" name="destinatari" value={d.id} checked={scelti.has(d.id)} onChange={() => tocca(d.id)} />
                <span className="truncate">{d.nome}</span>
                <span className="shrink-0 text-[11px] text-neutral-500">{NOMI_RUOLO[d.ruolo] ?? d.ruolo}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="text-xs font-semibold text-neutral-700">Parti da un modello
          <select value={modello} onChange={(e) => cambiaModello(e.target.value)} className={campo}>
            {MODELLI_COMUNICAZIONE.map((m) => <option key={m.chiave} value={m.chiave}>{m.nome}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-neutral-700">Oggetto
          <input name="oggetto" value={oggetto} onChange={(e) => setOggetto(e.target.value)} required className={campo} />
        </label>
        <label className="text-xs font-semibold text-neutral-700">Testo
          <textarea name="testo" value={testo} onChange={(e) => setTesto(e.target.value)} rows={14} required className={`${campo} font-mono text-xs`} />
        </label>
        <p className="text-[11px] text-neutral-500">
          Si riempiono da soli per ogni persona: {SEGNAPOSTO_COMUNICAZIONI.map(([k]) => `{${k}}`).join(" ")}. <b>**testo**</b> = grassetto, righe che iniziano con «- » = elenco.
        </p>

        <div className="rounded-lg border border-neutral-200 bg-white p-3 text-sm">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" name="conTask" value="1" checked={conTask} onChange={(e) => setConTask(e.target.checked)} /> 📌 Crea anche un task per ognuno
          </label>
          {conTask && (
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_160px]">
              <input name="titoloTask" value={titoloTask} onChange={(e) => setTitoloTask(e.target.value)} placeholder="cosa devono fare" className={campo} aria-label="Titolo del task" />
              <input name="scadenzaTask" type="date" className={campo} aria-label="Entro il" title="Entro il (facoltativo)" />
            </div>
          )}
          <p className="mt-1 text-[11px] text-neutral-500">Ognuno lo trova in «Comunicazioni» e sulla Dashboard, e lo segna «Fatto»: qui vedi chi l&apos;ha fatto.</p>
        </div>

        {admin && (
          <label className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${passwordAttiva ? "border-amber-300 bg-amber-50" : "border-neutral-200 bg-white"}`}>
            <input type="checkbox" name="password" value="1" checked={password} onChange={(e) => setPassword(e.target.checked)} className="mt-1" />
            <span><b>🔑 Dai a ognuno una password provvisoria nuova</b> (finisce al posto di <code>{"{password}"}</code>; al primo accesso la cambiano).<br />
              <span className="text-xs text-neutral-600">La password di prima non funzionerà più. Si cambia solo se l&apos;email parte davvero; la tua non si tocca.{password && !usaPassword(testo) ? " Il testo non contiene {password}: non verrà generata." : ""}</span></span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button name="prova" value="1" disabled={invio} className="btn-3d btn-3d-outline px-4 py-2 text-sm">🧪 Manda una prova a me</button>
          <button name="prova" value="0" disabled={invio || scelti.size === 0} className="btn-3d btn-3d-green px-4 py-2 text-sm disabled:opacity-60">
            {invio ? "Invio in corso…" : `✉️ Invia a ${scelti.size} ${scelti.size === 1 ? "persona" : "persone"}`}
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-neutral-600">Anteprima{esempio ? ` (come la riceve ${esempio.nome})` : ""}</p>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2">
          <p className="truncate px-1 pb-1 text-sm"><b>{esempio ? riempi(oggetto, valoriPer(esempio, { link })) : oggetto}</b></p>
          <iframe title="Anteprima della comunicazione" srcDoc={anteprima} sandbox="" className="h-[620px] w-full rounded-md border border-neutral-200 bg-white" />
        </div>
      </div>
    </form>
  );
}
