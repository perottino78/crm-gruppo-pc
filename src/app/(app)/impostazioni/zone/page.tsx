export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { assicuraIniziali } from "@/lib/permessi/server";
import { REGIONI, provinceDi, varianti } from "@/lib/zone/regioni";
import { visibilitaDi } from "@/lib/permessi/catalogo";
import { salvaZona, eliminaZona } from "@/app/permessi-actions";

type P = { ok?: string; errore?: string; salvato?: string };

export default async function ZonePage({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  if (!u || u.ruolo !== "AMMINISTRATORE") notFound();
  const p = await searchParams;
  await assicuraIniziali();
  const [zone, utenti] = await Promise.all([
    prisma.zonaCommerciale.findMany({ orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
    prisma.utente.findMany({ where: { stato: { not: "DISATTIVATO" } }, orderBy: { nome: "asc" } }),
  ]);
  const clientiPerZona = await Promise.all(zone.map((z) => {
    const prov = provinceDi(z.regioni, z.provinceExtra);
    return prov.length ? prisma.cliente.count({ where: { provincia: { in: varianti(prov) } } }) : Promise.resolve(0);
  }));

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <Link href="/impostazioni" className="text-sm text-blue-800 underline">← Impostazioni</Link>
        <h1 className="text-2xl font-extrabold text-neutral-900">🗺️ Zone commerciali</h1>
        <p className="text-sm text-neutral-600">
          Ogni zona raccoglie una o più regioni (e, se serve, province in più) con il suo <b>responsabile commerciale</b>. Il responsabile, con un profilo
          che vede «La sua zona» (es. «Responsabile commerciale di zona» in <Link href="/impostazioni/ruoli" className="underline">Ruoli e permessi</Link>), vede i
          clienti delle province della zona e il lavoro dei venditori assegnati alla zona. I venditori si assegnano alla zona in Ruoli e permessi.
        </p>
      </div>
      {p.ok && <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">✅ {p.ok}</p>}
      {p.errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{p.errore}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {zone.map((z, i) => {
          const venditori = utenti.filter((x) => x.zonaId === z.id);
          const resp = utenti.find((x) => x.id === z.responsabileId);
          return (
            <section key={z.id} id={`zona-${z.id}`} className="card-fase" style={{ ["--fase" as string]: "#ea580c" }}>
              <h2>📍 {z.nome}</h2>
              <p className="mt-1 text-xs text-neutral-600">
                {clientiPerZona[i]} clienti in zona · province: {provinceDi(z.regioni, z.provinceExtra).join(", ") || "nessuna"}
                {resp && visibilitaDi(resp) !== "ZONA" && <span className="block font-semibold text-amber-800">⚠ {resp.nome} è responsabile, ma il suo profilo non vede «La sua zona»: assegnagli il profilo «Responsabile commerciale di zona».</span>}
              </p>
              <form action={salvaZona} className="mt-3 space-y-3">
                <input type="hidden" name="id" value={z.id} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-bold text-neutral-700">Nome della zona<input name="nome" defaultValue={z.nome} className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1.5 text-sm font-normal" /></label>
                  <label className="text-xs font-bold text-neutral-700">Responsabile commerciale
                    <select name="responsabileId" defaultValue={z.responsabileId ?? ""} className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1.5 text-sm font-normal">
                      <option value="">— nessuno</option>
                      {utenti.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                    </select>
                  </label>
                </div>
                <fieldset>
                  <legend className="mb-1 text-xs font-bold text-neutral-700">Regioni</legend>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
                    {Object.keys(REGIONI).map((r) => (
                      <label key={r} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name={`r:${r}`} defaultChecked={z.regioni.includes(r)} /> {r}</label>
                    ))}
                  </div>
                </fieldset>
                <label className="block text-xs font-bold text-neutral-700">Province in più (sigle, es. PC, PR)
                  <input name="provinceExtra" defaultValue={z.provinceExtra.join(", ")} className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1.5 text-sm font-normal" />
                </label>
                <fieldset>
                  <input type="hidden" name="conTeam" value="1" />
                  <legend className="mb-1 text-xs font-bold text-neutral-700">Team della zona ({venditori.length}) — spunta chi lavora qui</legend>
                  <div className="grid max-h-56 grid-cols-1 gap-x-3 gap-y-0.5 overflow-y-auto rounded border border-neutral-200 p-2 sm:grid-cols-2">
                    {utenti.map((x) => {
                      const altrove = x.zonaId && x.zonaId !== z.id ? zone.find((zz) => zz.id === x.zonaId)?.nome : null;
                      return (
                        <label key={x.id} className="flex items-center gap-1.5 text-sm">
                          <input type="checkbox" name="membri" value={x.id} defaultChecked={x.zonaId === z.id || z.responsabileId === x.id} />
                          {x.nome}{altrove && <span className="text-[11px] text-neutral-400"> (ora in {altrove})</span>}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-3d btn-3d-green px-4 py-2 text-sm">💾 Salva la zona</button>
                  {p.salvato === z.id && <span className="self-center rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-800">✓ Salvata</span>}
                  <button formAction={eliminaZona} className="btn-3d btn-3d-outline px-3 py-2 text-xs">Elimina zona</button>
                </div>
              </form>
            </section>
          );
        })}
      </div>

      <form action={salvaZona} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-neutral-300 bg-white p-3">
        <label className="text-xs font-bold text-neutral-700">Nuova zona<input name="nome" required placeholder="es. Emilia-Romagna" className="mt-1 block w-64 rounded border border-neutral-300 px-2 py-1.5 text-sm font-normal" /></label>
        <span className="text-xs text-neutral-500">Se il nome è una regione la spunta da sola; poi scegli il responsabile.</span>
        <button className="btn-3d btn-3d-orange px-4 py-2 text-sm">+ Crea zona</button>
      </form>
    </div>
  );
}
