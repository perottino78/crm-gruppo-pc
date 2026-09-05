export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { aggiornaPermessiBrand, impostaObiettivo } from "@/app/actions";

const STATI_PREVENTIVO_APERTI = ["APERTO"];
const STATI_APPUNTAMENTO_APERTI = ["PROGRAMMATO", "CONFERMATO"];

function periodoCorrente(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function labelPeriodo(periodo: string): string {
  const [anno, mese] = periodo.split("-");
  const nomi = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  return `${nomi[Number(mese) - 1] ?? mese} ${anno}`;
}

export default async function SchedaCommercialePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const utente = await prisma.utente.findUnique({
    where: { id },
    include: {
      brandAutorizzati: true,
      obiettivi: { orderBy: { periodo: "desc" } },
      preventivi: { include: { cliente: true, brand: true }, orderBy: { createdAt: "desc" } },
      appuntamenti: { include: { cliente: true }, orderBy: { dataOra: "desc" } },
    },
  });
  if (!utente) notFound();

  const brands = await prisma.brand.findMany({ orderBy: { nome: "asc" } });
  const brandAutorizzatiIds = new Set(utente.brandAutorizzati.map((b) => b.id));

  const preventiviAperti = utente.preventivi.filter((p) => STATI_PREVENTIVO_APERTI.includes(p.stato));
  const preventiviAccettati = utente.preventivi.filter((p) => p.stato === "ACCETTATO");
  const preventiviPersi = utente.preventivi.filter((p) => p.stato === "SCADUTO" || p.stato === "ANNULLATO");
  const valoreAperti = preventiviAperti.reduce((s, p) => s + p.totaleNetto, 0);
  const valoreAccettati = preventiviAccettati.reduce((s, p) => s + p.totaleNetto, 0);
  const tassoChiusura = utente.preventivi.length > 0 ? Math.round((preventiviAccettati.length / utente.preventivi.length) * 100) : 0;

  const appuntamentiEseguiti = utente.appuntamenti.filter((a) => a.stato === "COMPLETATO");
  const appuntamentiAperti = utente.appuntamenti.filter((a) => STATI_APPUNTAMENTO_APERTI.includes(a.stato));
  const appuntamentiAnnullati = utente.appuntamenti.filter((a) => a.stato === "ANNULLATO");

  const periodo = periodoCorrente();
  const obiettivoCorrente = utente.obiettivi.find((o) => o.periodo === periodo);
  const realizzatoMese = utente.preventivi
    .filter((p) => p.stato === "ACCETTATO" && `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, "0")}` === periodo)
    .reduce((s, p) => s + p.totaleNetto, 0);
  const percentualeObiettivo = obiettivoCorrente && obiettivoCorrente.importoTarget > 0
    ? Math.min(999, Math.round((realizzatoMese / obiettivoCorrente.importoTarget) * 100))
    : null;

  return (
    <div className="max-w-5xl">
      <Link href="/commerciali" className="text-xs text-neutral-600 hover:underline">
        ← Team &amp; performance
      </Link>
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-2xl font-bold text-neutral-900">{utente.nome}</h1>
        <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600">{utente.ruolo}</span>
      </div>
      <p className="text-sm text-neutral-600 mb-6">{utente.email} · in squadra dal {utente.createdAt.toLocaleDateString("it-IT")}</p>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-neutral-200 border-l-4 border-l-blue-500 p-4 shadow-sm">
          <p className="text-xs font-semibold text-neutral-600 mb-1">Preventivi aperti</p>
          <p className="text-lg font-bold text-neutral-900">{preventiviAperti.length}</p>
          <p className="text-xs text-neutral-600">{valoreAperti.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</p>
        </div>
        <div className="bg-green-50 border border-green-200 border-l-4 border-l-green-600 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-green-700 mb-1">Contratti chiusi (accettati)</p>
          <p className="text-lg font-bold text-green-800">{preventiviAccettati.length}</p>
          <p className="text-xs text-green-700">{valoreAccettati.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 border-l-4 border-l-purple-500 p-4 shadow-sm">
          <p className="text-xs font-semibold text-neutral-600 mb-1">Tasso di chiusura</p>
          <p className="text-lg font-bold text-neutral-900">{tassoChiusura}%</p>
          <p className="text-xs text-neutral-600">{preventiviPersi.length} persi (scaduti/annullati)</p>
        </div>
        <div className="bg-neutral-900 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-neutral-300 mb-1">Appuntamenti eseguiti</p>
          <p className="text-lg font-bold text-white">{appuntamentiEseguiti.length}</p>
          <p className="text-xs text-neutral-300">{appuntamentiAperti.length} programmati · {appuntamentiAnnullati.length} annullati</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <h2 className="text-base font-bold text-neutral-900 mb-3">Obiettivo del mese — {labelPeriodo(periodo)}</h2>
        {obiettivoCorrente ? (
          <div className="mb-3">
            <div className="flex items-center justify-between text-sm mb-1">
              <span>{realizzatoMese.toLocaleString("it-IT", { style: "currency", currency: "EUR" })} realizzato</span>
              <span className="text-neutral-600">obiettivo {obiettivoCorrente.importoTarget.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
            </div>
            <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, percentualeObiettivo ?? 0)}%`, background: (percentualeObiettivo ?? 0) >= 100 ? "#16A34A" : "#2563EB" }}
              />
            </div>
            <p className="text-xs text-neutral-600 mt-1">{percentualeObiettivo}% dell&apos;obiettivo raggiunto</p>
          </div>
        ) : (
          <p className="text-xs text-neutral-600 mb-3">Nessun obiettivo impostato per questo mese.</p>
        )}
        <form action={impostaObiettivo} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="utenteId" value={utente.id} />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-700">Periodo</label>
            <input name="periodo" type="month" defaultValue={periodo} className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-700">Obiettivo (€)</label>
            <input
              name="importoTarget"
              type="number"
              step="0.01"
              min="0"
              defaultValue={obiettivoCorrente?.importoTarget ?? ""}
              className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-32"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-xs text-neutral-700">Note</label>
            <input name="note" defaultValue={obiettivoCorrente?.note ?? ""} className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-full" />
          </div>
          <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Salva obiettivo</button>
        </form>
        {utente.obiettivi.length > 1 && (
          <div className="mt-3 pt-3 border-t border-neutral-100 flex flex-wrap gap-3 text-xs text-neutral-600">
            {utente.obiettivi.filter((o) => o.periodo !== periodo).slice(0, 6).map((o) => (
              <span key={o.id}>{labelPeriodo(o.periodo)}: {o.importoTarget.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <h2 className="text-base font-bold text-neutral-900 mb-1">Permessi listino</h2>
        <p className="text-xs text-neutral-600 mb-3">Aziende/famiglie per cui questo utente è autorizzato a operare (impostati dall&apos;amministratore). Nessuna spunta = accesso a tutti i listini.</p>
        <form action={aggiornaPermessiBrand} className="flex flex-wrap items-center gap-4">
          <input type="hidden" name="utenteId" value={utente.id} />
          {brands.map((b) => (
            <label key={b.id} className="text-sm flex items-center gap-1.5">
              <input type="checkbox" name="brandIds" value={b.id} defaultChecked={brandAutorizzatiIds.has(b.id)} />
              {b.nome}
            </label>
          ))}
          <button className="btn-3d btn-3d-outline text-xs px-3 py-1.5">salva permessi</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-base font-bold text-neutral-900 mb-3">Preventivi ({utente.preventivi.length})</h2>
          <div className="flex flex-col divide-y divide-neutral-50 max-h-80 overflow-y-auto">
            {utente.preventivi.map((p) => (
              <Link
                key={p.id}
                href={`/preventivi/${p.id}`}
                className="text-sm py-1.5 flex items-center justify-between hover:bg-neutral-50 -mx-1 px-1"
              >
                <span>{p.cliente.nome} <span className="text-xs text-neutral-600">· {p.brand.nome}</span></span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-neutral-700">{p.totaleNetto.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">{p.stato}</span>
                </span>
              </Link>
            ))}
            {utente.preventivi.length === 0 && <p className="text-xs text-neutral-500 italic py-2">Nessuno</p>}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-base font-bold text-neutral-900 mb-3">Appuntamenti ({utente.appuntamenti.length})</h2>
          <div className="flex flex-col divide-y divide-neutral-50 max-h-80 overflow-y-auto">
            {utente.appuntamenti.map((a) => (
              <div key={a.id} className="text-sm py-1.5">
                <div className="flex items-center justify-between">
                  <span>{a.cliente.nome} <span className="text-xs text-neutral-600">· {a.tipo}</span></span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">{a.stato}</span>
                </div>
                <p className="text-xs text-neutral-600">{a.dataOra.toLocaleString("it-IT")}</p>
              </div>
            ))}
            {utente.appuntamenti.length === 0 && <p className="text-xs text-neutral-500 italic py-2">Nessuno</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
