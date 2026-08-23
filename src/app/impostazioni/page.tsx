export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { aggiornaConfigurazione, creaUtente } from "@/app/actions";
import { BRANDS } from "@/lib/brands";

const RUOLI = ["COMMERCIALE", "TELEFONISTA", "POSATORE", "AMMINISTRATIVO", "AMMINISTRATORE"];

export default async function ImpostazioniPage() {
  const [config, utenti, brands] = await Promise.all([
    prisma.configurazione.findMany({ orderBy: { chiave: "asc" } }),
    prisma.utente.findMany({ orderBy: { nome: "asc" } }),
    prisma.brand.findMany({ orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-medium mb-6">Impostazioni</h1>

      <h2 className="text-sm font-medium text-neutral-700 mb-3">Configurazione listino e IVA</h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-8">
        {config.map((c) => (
          <form
            key={c.id}
            action={aggiornaConfigurazione}
            className="flex items-center justify-between px-4 py-3 text-sm gap-3"
          >
            <input type="hidden" name="id" value={c.id} />
            <span className="text-neutral-500">{c.chiave}</span>
            <div className="flex items-center gap-2">
              <input
                name="valore"
                defaultValue={c.valore}
                className="border border-neutral-200 rounded px-2 py-1 text-sm w-28 text-right"
              />
              <button className="text-xs text-blue-600 underline">salva</button>
            </div>
          </form>
        ))}
      </div>

      <h2 className="text-sm font-medium text-neutral-700 mb-3">Brand attivi</h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-8">
        {brands.map((b) => {
          const c = BRANDS.find((x) => x.nome === b.nome);
          return (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="w-4 h-4 rounded-full inline-block" style={{ background: c?.primary ?? "#999" }} />
              <span className="font-medium">{b.nome}</span>
            </div>
          );
        })}
      </div>

      <h2 className="text-sm font-medium text-neutral-700 mb-3">Utenti e ruoli</h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-6">
        {utenti.map((u) => (
          <div key={u.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p>{u.nome}</p>
              <p className="text-xs text-neutral-400">{u.email}</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600">{u.ruolo}</span>
          </div>
        ))}
      </div>

      <form action={creaUtente} className="bg-white rounded-lg border border-neutral-200 p-4 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Nome</label>
          <input name="nome" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Email</label>
          <input name="email" type="email" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Ruolo</label>
          <select name="ruolo" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
            {RUOLI.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Aggiungi utente</button>
      </form>
    </div>
  );
}
