export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { creaAttivita, completaAttivita, creaPreventivo } from "@/app/actions";
import Link from "next/link";
import { notFound } from "next/navigation";

const TIPI = [
  { v: "NOTA", label: "Nota", icon: "📝" },
  { v: "CHIAMATA", label: "Chiamata", icon: "📞" },
  { v: "EMAIL", label: "Email", icon: "✉️" },
  { v: "TASK", label: "Task / scadenza", icon: "✅" },
];

function iconPer(tipo: string) {
  return TIPI.find((t) => t.v === tipo)?.icon ?? "•";
}

export default async function SchedaClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      brand: true,
      leadOrigine: true,
      appuntamenti: { include: { utente: true }, orderBy: { dataOra: "desc" } },
      preventivi: { include: { commerciale: true }, orderBy: { createdAt: "desc" } },
      attivita: { include: { utente: true }, orderBy: { dataOra: "desc" } },
    },
  });

  if (!cliente) notFound();

  const utenti = await prisma.utente.findMany({ orderBy: { nome: "asc" } });
  const brands = await prisma.brand.findMany({ orderBy: { nome: "asc" } });
  const commerciali = await prisma.utente.findMany({ where: { ruolo: "COMMERCIALE" }, orderBy: { nome: "asc" } });
  const taskAperti = cliente.attivita.filter((a) => a.tipo === "TASK" && !a.completata);

  return (
    <div className="max-w-4xl">
      <Link href="/clienti" className="text-xs text-neutral-400 hover:underline">
        ← Clienti
      </Link>
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-xl font-medium">{cliente.nome}</h1>
        <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600">
          {cliente.brand.nome}
        </span>
      </div>
      <p className="text-sm text-neutral-400 mb-6">
        {cliente.telefono ?? "—"} · {cliente.email ?? "—"} · {cliente.indirizzo ?? "—"} · {cliente.paese}
        {cliente.leadOrigine && <> · lead origine: {cliente.leadOrigine.fonte}</>}
      </p>

      {taskAperti.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-6">
          <p className="text-xs font-medium text-amber-700 mb-1">Task aperti ({taskAperti.length})</p>
          {taskAperti.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm py-1">
              <span>
                {t.oggetto} {t.scadenza && <span className="text-xs text-amber-600">— scadenza {t.scadenza.toLocaleDateString("it-IT")}</span>}
              </span>
              <form action={completaAttivita}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="clienteId" value={cliente.id} />
                <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">✓ segna come fatto</button>
              </form>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <h2 className="text-sm font-medium text-neutral-700 mb-3">Nuova offerta / preventivo — scegli azienda</h2>
        <form action={creaPreventivo} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="clienteId" value={cliente.id} />
          <div className="flex gap-2 flex-wrap">
            {brands.map((b) => (
              <label key={b.id} className="text-xs">
                <input type="radio" name="brandId" value={b.id} defaultChecked={b.id === cliente.brandId} required className="mr-1" />
                {b.nome}
              </label>
            ))}
          </div>
          <select name="commercialeId" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
            <option value="">Commerciale...</option>
            {commerciali.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
          <button className="btn-3d btn-3d-green text-sm px-4 py-2">Apri offerta →</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-medium text-neutral-700 mb-3">Appuntamenti ({cliente.appuntamenti.length})</h2>
          {cliente.appuntamenti.map((a) => (
            <div key={a.id} className="text-sm py-1.5 border-b border-neutral-50 last:border-0">
              <p>{a.dataOra.toLocaleString("it-IT")} · {a.tipo}</p>
              <p className="text-xs text-neutral-400">{a.utente.nome} · {a.stato}</p>
            </div>
          ))}
          {cliente.appuntamenti.length === 0 && <p className="text-xs text-neutral-300 italic">Nessuno</p>}
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-medium text-neutral-700 mb-3">Preventivi ({cliente.preventivi.length})</h2>
          {cliente.preventivi.map((p) => (
            <Link
              key={p.id}
              href={`/preventivi/${p.id}`}
              className="text-sm py-1.5 border-b border-neutral-50 last:border-0 flex items-center justify-between hover:bg-neutral-50 -mx-4 px-4"
            >
              <span>{p.totaleNetto.toLocaleString("it-IT", { style: "currency", currency: "EUR" })} · {p.commerciale.nome}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">{p.stato}</span>
            </Link>
          ))}
          {cliente.preventivi.length === 0 && <p className="text-xs text-neutral-300 italic">Nessuno</p>}
        </div>
      </div>

      <form action={creaAttivita} className="bg-white rounded-lg border border-neutral-200 p-4 mb-6 flex flex-wrap items-end gap-2">
        <input type="hidden" name="clienteId" value={cliente.id} />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Tipo</label>
          <select name="tipo" defaultValue="NOTA" className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
            {TIPI.map((t) => (
              <option key={t.v} value={t.v}>{t.icon} {t.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-xs text-neutral-500">Oggetto</label>
          <input name="oggetto" required placeholder="es. Chiamato per confermare misure" className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-full" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Scadenza (solo task)</label>
          <input name="scadenza" type="date" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Chi</label>
          <select name="utenteId" className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
            <option value="">—</option>
            {utenti.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 w-full">
          <label className="text-xs text-neutral-500">Note</label>
          <textarea name="descrizione" rows={2} className="border border-neutral-200 rounded px-2 py-1.5 text-sm w-full" />
        </div>
        <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Registra attività</button>
      </form>

      <h2 className="text-sm font-medium text-neutral-700 mb-3">Diario attività ({cliente.attivita.length})</h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
        {cliente.attivita.map((a) => (
          <div key={a.id} className="px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{iconPer(a.tipo)} {a.oggetto}</span>
              <span className="text-xs text-neutral-400">{a.dataOra.toLocaleString("it-IT")}</span>
            </div>
            {a.descrizione && <p className="text-xs text-neutral-500 mt-1">{a.descrizione}</p>}
            <p className="text-xs text-neutral-300 mt-1">
              {a.utente?.nome ?? "—"}
              {a.tipo === "TASK" && (a.completata ? " · completato" : " · da fare")}
            </p>
          </div>
        ))}
        {cliente.attivita.length === 0 && (
          <p className="px-4 py-6 text-sm text-neutral-400">Nessuna attività registrata ancora.</p>
        )}
      </div>
    </div>
  );
}
