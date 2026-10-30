import Link from "next/link";
import type { PraticaCliente } from "@/lib/clienti/scheda";
import { ESITI } from "@/lib/clienti/pratica";
import { nomeUfficio, statoTask } from "@/lib/flusso";
import { STATI_COMMESSA, eur } from "@/lib/commesse";

const dataBreve = (d: Date) => d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });

function Stepper({ passi }: { passi: PraticaCliente["passi"] }) {
  return (
    <ol className="flex items-start w-full overflow-x-auto pb-1">
      {passi.map((p, i) => {
        const ultimo = i === passi.length - 1;
        const cerchio =
          p.stato === "fatto"
            ? "bg-emerald-500 border-emerald-500 text-white"
            : p.stato === "corrente"
              ? "bg-white border-blue-600 text-blue-700 ring-4 ring-blue-100"
              : p.stato === "stop"
                ? "bg-red-500 border-red-500 text-white"
                : "bg-white border-neutral-300 text-neutral-400";
        const linea = p.stato === "fatto" ? "bg-emerald-500" : "bg-neutral-200";
        return (
          <li key={p.chiave} className="flex-1 min-w-[84px] relative">
            {!ultimo && <span className={`absolute top-[13px] left-1/2 w-full h-[3px] ${linea}`} aria-hidden />}
            <div className="relative flex flex-col items-center text-center px-1">
              <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${cerchio}`}>
                {p.stato === "fatto" ? "✓" : p.stato === "stop" ? "✕" : i + 1}
              </span>
              <span
                className={`mt-1.5 text-[11px] leading-tight ${
                  p.stato === "corrente" ? "font-extrabold text-blue-800" : p.stato === "fatto" ? "font-semibold text-neutral-800" : p.stato === "stop" ? "font-semibold text-red-700" : "text-neutral-400"
                }`}
              >
                {p.nome}
              </span>
              {p.stato === "corrente" && p.ufficio && (
                <span className="mt-0.5 text-[10px] px-1.5 py-px rounded bg-blue-600 text-white font-semibold">{nomeUfficio(p.ufficio)}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Chip({ href, icona, label, n, colore }: { href?: string; icona: string; label: string; n: number; colore: string }) {
  const cls = `inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border ${n ? colore : "border-neutral-200 text-neutral-400 bg-white"}`;
  const body = (
    <>
      <span aria-hidden>{icona}</span> {label} <strong>{n}</strong>
    </>
  );
  return href && n ? <Link href={href} className={cls + " hover:brightness-95"}>{body}</Link> : <span className={cls}>{body}</span>;
}

export default function PraticaCard({ p, vediAcquisti }: { p: PraticaCliente; vediAcquisti: boolean }) {
  const esito = ESITI[p.esito];
  const accento =
    p.esito === "IN_CORSO" ? "border-l-blue-600" : p.esito === "TRATTATIVA" ? "border-l-amber-500" : p.esito === "CONCLUSA" ? "border-l-emerald-500" : "border-l-neutral-300";
  const linkCommessa = p.commessa ? `/commesse/${p.commessa.id}` : null;
  return (
    <article className={`bg-white rounded-xl border border-neutral-200 border-l-[6px] ${accento} shadow-sm`}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/preventivi/${p.id}`} className="text-base font-extrabold text-neutral-900 hover:underline">
              Offerta {p.numeroOfferta ? `N° ${p.numeroOfferta}` : "(bozza)"}
            </Link>
            <span className="text-xs text-neutral-500">del {dataBreve(p.data)}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 font-semibold">{p.brand}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ring-1 font-bold ${esito.cls}`}>{esito.label}</span>
            {p.archiviata && <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">archiviata</span>}
          </div>
          <p className="text-sm text-neutral-700 mt-0.5 truncate">
            {p.oggetto || "Senza riferimento"} <span className="text-neutral-400">· {p.commerciale}</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-extrabold text-neutral-900 tabular-nums">{eur(p.totale)}</p>
          <p className="text-[11px] text-neutral-500">{p.percentuale}% del percorso</p>
        </div>
      </header>

      <div className="px-4 pt-4 pb-2">
        <Stepper passi={p.passi} />
      </div>

      {p.taskAperti.length > 0 && (
        <div className="mx-4 mb-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-blue-800 mb-1">Adesso tocca a</p>
          {p.taskAperti.map((t) => {
            const st = statoTask(t.stato);
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm py-0.5">
                <span className="font-bold text-blue-900">{nomeUfficio(t.ufficio)}</span>
                <span className="text-neutral-800">{t.titolo}</span>
                {t.assegnatoNome && <span className="text-xs text-neutral-500">· {t.assegnatoNome}</span>}
                <span className="text-[10px] px-1.5 py-px rounded text-white font-semibold" style={{ background: st.colore }}>{st.nome}</span>
              </div>
            );
          })}
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 px-4 py-2.5 bg-neutral-50/60 rounded-b-xl">
        <div className="flex flex-wrap gap-1.5">
          {p.rilievo && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-800">
              📐 Rilievo {p.rilievo.dataOra.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "short" })} · {p.rilievo.stato.toLowerCase()}
            </span>
          )}
          {vediAcquisti && (
            <>
              <Chip href={linkCommessa ?? undefined} icona="🚚" label="Ordini" n={p.conteggi.ordini} colore="border-purple-200 bg-purple-50 text-purple-800" />
              <Chip href={linkCommessa ?? undefined} icona="📦" label="Bolle" n={p.conteggi.bolle} colore="border-orange-200 bg-orange-50 text-orange-800" />
            </>
          )}
          {p.conteggi.fatture > 0 && <Chip icona="🧾" label="Fatture forn." n={p.conteggi.fatture} colore="border-rose-200 bg-rose-50 text-rose-800" />}
          <Chip href={`?sez=file`} icona="📎" label="File" n={p.conteggi.file} colore="border-red-200 bg-red-50 text-red-800" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/preventivi/${p.id}`} className="btn-3d btn-3d-outline text-xs px-3 py-1.5">Apri offerta</Link>
          {p.commessa && (
            <Link href={`/commesse/${p.commessa.id}`} className="btn-3d btn-3d-blue text-xs px-3 py-1.5" title={STATI_COMMESSA[p.commessa.stato]?.label}>
              Commessa {p.commessa.numero} →
            </Link>
          )}
        </div>
      </footer>
    </article>
  );
}
