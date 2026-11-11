// Riquadro dell'amministratore nella scheda di una persona del team: stato, mansione, passaggio del lavoro, eliminazione.
import type { Utente } from "@prisma/client";
import { impostaStatoUtente, cambiaMansioneUtente, passaLavoroUtente, eliminaUtente } from "@/app/team-actions";
import { STATI_UTENTE, RUOLI_UTENTE, statoUtente, totaleCollegati } from "@/lib/utenti/stato";
import { UFFICI } from "@/lib/flusso";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";

export default function GestioneUtente({ utente: u, colleghi, collegati, lavoroAperto, io }: {
  utente: Utente;
  colleghi: { id: string; nome: string }[];
  collegati: Record<string, number>;
  lavoroAperto: Record<string, number>;
  io: boolean;
}) {
  const s = statoUtente(u.stato);
  const ritorno = `/commerciali/${u.id}`;
  const aperto = Object.entries(lavoroAperto).filter(([, v]) => v);
  const nCollegati = totaleCollegati(collegati);
  return (
    <div id="gestione" className="card-fase bg-white rounded-lg border border-neutral-200 p-4 mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-neutral-900">⚙️ Gestione (amministratore)</h2>
        <span className={`text-xs px-2 py-1 rounded-full ${s.classe}`}>{s.nome}{u.statoDal && u.stato !== "ATTIVO" ? ` dal ${u.statoDal.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}` : ""}</span>
      </div>

      <form action={impostaStatoUtente} className="space-y-2">
        <input type="hidden" name="utenteId" value={u.id} />
        <input type="hidden" name="ritorno" value={ritorno} />
        <p className="text-sm font-semibold">1. Stato</p>
        <div className="flex flex-wrap gap-2">
          {STATI_UTENTE.map((x) => (
            <label key={x.chiave} className={`flex items-start gap-2 text-sm px-3 py-2 rounded border cursor-pointer max-w-xs ${u.stato === x.chiave ? "border-teal-400 bg-teal-50" : "border-neutral-200"}`}>
              <input type="radio" name="stato" value={x.chiave} defaultChecked={u.stato === x.chiave} disabled={io && x.chiave !== "ATTIVO"} className="mt-1" />
              <span><b>{x.nome}</b><span className="block text-xs text-neutral-600">{x.spiega}</span></span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-neutral-600">Nota (facoltativa)
            <input name="nota" defaultValue={u.statoNota ?? ""} placeholder="es. maternità fino a marzo · passato al magazzino · ha lasciato l'azienda" className={`${inp} w-96 max-w-full block`} />
          </label>
          <button className="btn-3d btn-3d-teal text-sm px-4 py-2">Salva stato</button>
        </div>
        {io && <p className="text-xs text-neutral-500">Non puoi mettere in pausa o disattivare te stesso.</p>}
      </form>

      <form action={cambiaMansioneUtente} className="space-y-2 border-t border-neutral-100 pt-3">
        <input type="hidden" name="utenteId" value={u.id} />
        <input type="hidden" name="ritorno" value={ritorno} />
        <p className="text-sm font-semibold">2. Mansione ed email</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-neutral-600">Ruolo (cosa vede e può fare)
            <select name="ruolo" defaultValue={u.ruolo} className={`${inp} block`}>{RUOLI_UTENTE.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          </label>
          <label className="text-xs text-neutral-600">Ufficio (task delle pratiche)
            <select name="ufficio" defaultValue={u.ufficio ?? "__nessuno__"} className={`${inp} block`}>
              <option value="__nessuno__">— nessuno —</option>
              {UFFICI.map((x) => <option key={x.chiave} value={x.chiave}>{x.nome}</option>)}
            </select>
          </label>
          <label className="text-xs text-neutral-600">Email di lavoro (dell&apos;ufficio)
            <input name="email" type="email" required defaultValue={u.email} className={`${inp} block w-72 max-w-full`} />
          </label>
          <input type="hidden" name="conVende" value="1" />
          <label className="flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-2 py-1.5 text-xs text-neutral-700">
            <input type="checkbox" name="vende" value="1" defaultChecked={u.vende || u.ruolo === "COMMERCIALE"} disabled={u.ruolo === "COMMERCIALE"} />
            <span><b>Vende anche</b> (fa offerte ai clienti): compare come commerciale, ha obiettivi, premi e provvigioni</span>
          </label>
          <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Salva mansione ed email</button>
        </div>
      </form>

      <form action={passaLavoroUtente} className="space-y-2 border-t border-neutral-100 pt-3">
        <input type="hidden" name="utenteId" value={u.id} />
        <input type="hidden" name="ritorno" value={ritorno} />
        <p className="text-sm font-semibold">3. Passa il suo lavoro a un collega</p>
        <p className="text-sm text-neutral-600">
          {aperto.length ? <>Lavoro ancora aperto: <b>{aperto.map(([k, v]) => `${v} ${k}`).join(" · ")}</b>.</> : "Non ha lavoro aperto."}{" "}
          Si passano clienti seguiti, offerte aperte, pratiche in corso, lead da lavorare, appuntamenti/rilievi/pose futuri, task e assistenze aperti.
          Lo storico chiuso resta a suo nome.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <select name="aUtenteId" required defaultValue="" className={inp}>
            <option value="" disabled>Scegli il collega…</option>
            {colleghi.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <button className="btn-3d btn-3d-amber text-sm px-4 py-2" disabled={!aperto.length}>Passa il lavoro</button>
        </div>
      </form>

      {!io && (
        <details className="border-t border-neutral-100 pt-3">
          <summary className="text-sm text-red-800 cursor-pointer">4. Elimina</summary>
          {nCollegati ? (
            <p className="text-sm text-neutral-600 mt-2">
              Non si può eliminare: ha dati collegati ({Object.entries(collegati).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(", ")}) e si perderebbe lo storico.
              Mettilo <b>Disattivato</b>: non entra più e non compare nelle assegnazioni, ma i suoi numeri restano.
            </p>
          ) : (
            <form action={eliminaUtente} className="flex flex-wrap items-center gap-2 mt-2">
              <input type="hidden" name="utenteId" value={u.id} />
              <input type="hidden" name="ritorno" value={ritorno} />
              <span className="text-sm text-neutral-600">Non ha nessun dato collegato (es. creato per sbaglio): si può eliminare definitivamente.</span>
              <button className="btn-3d btn-3d-red text-sm px-4 py-2">Elimina {u.nome}</button>
            </form>
          )}
        </details>
      )}
    </div>
  );
}
