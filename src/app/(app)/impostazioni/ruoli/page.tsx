export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { AREE, VISIBILITA, permessiDi, visibilitaDi } from "@/lib/permessi/catalogo";
import { assicuraIniziali } from "@/lib/permessi/server";
import { nomeUfficio } from "@/lib/flusso";
import { salvaProfilo, eliminaProfilo, assegnaAccesso } from "@/app/permessi-actions";

type P = { ok?: string; errore?: string; aperto?: string; salvato?: string };

export default async function RuoliPage({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  if (!u || u.ruolo !== "AMMINISTRATORE") notFound();
  const p = await searchParams;
  await assicuraIniziali();
  const [profili, utenti, zone] = await Promise.all([
    prisma.profiloAccesso.findMany({ orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
    prisma.utente.findMany({ where: { stato: { not: "DISATTIVATO" } }, orderBy: { nome: "asc" } }),
    prisma.zonaCommerciale.findMany({ where: { attiva: true }, orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
  ]);
  const nomeVis = (v: string) => VISIBILITA.find((x) => x.chiave === v)?.nome ?? v;

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <Link href="/impostazioni" className="btn-indietro">← Impostazioni</Link>
        <h1 className="text-2xl font-extrabold text-neutral-900">🔐 Ruoli e permessi</h1>
        <p className="text-sm text-neutral-600">
          Come i Gruppi di BConsole: ogni <b>profilo</b> dice <b>cosa</b> si può vedere e fare (le spunte) e <b>quali dati</b> (solo i propri, la propria
          zona, tutto). Assegna un profilo a ogni persona qui sotto. Chi non ha un profilo continua con i permessi del suo ruolo. L&apos;amministratore vede sempre tutto.
          Le zone commerciali si impostano in <Link href="/impostazioni/zone" className="underline">Zone commerciali</Link>.
        </p>
      </div>
      {p.ok && <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">✅ {p.ok}</p>}
      {p.errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{p.errore}</p>}

      <section className="card-fase" style={{ ["--fase" as string]: "#2563eb" }}>
        <h2>👤 Chi ha quale profilo</h2>
        <div className="mt-3 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {utenti.map((x) => {
            const prof = profili.find((pr) => pr.id === x.profiloId);
            return (
              <form key={x.id} id={`persona-${x.id}`} action={assegnaAccesso} className={`${p.salvato === x.id ? "bg-green-50 " : ""}grid items-end gap-2 px-3 py-2.5 text-sm md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto_auto]`}>
                <input type="hidden" name="utenteId" value={x.id} />
                <div className="min-w-0">
                  <b className="text-neutral-900">{x.nome}</b>
                  <span className="block truncate text-xs text-neutral-500">{x.ruolo}{x.ufficio ? ` · ${nomeUfficio(x.ufficio)}` : ""} · vede: {nomeVis(visibilitaDi(x))} · {permessiDi(x).size} sezioni</span>
                </div>
                {x.ruolo === "AMMINISTRATORE" ? <span className="text-xs text-neutral-500">Amministratore: vede e fa tutto</span> : (
                  <label className="text-[11px] text-neutral-600">Profilo
                    <select name="profiloId" defaultValue={x.profiloId ?? ""} className="mt-0.5 block w-full rounded border border-neutral-300 px-2 py-1.5 text-sm">
                      <option value="">— permessi del ruolo {x.ruolo.toLowerCase()}</option>
                      {profili.map((pr) => <option key={pr.id} value={pr.id}>{pr.nome}</option>)}
                    </select>
                  </label>
                )}
                <label className="text-[11px] text-neutral-600">Zona commerciale
                  <select name="zonaId" defaultValue={x.zonaId ?? ""} className="mt-0.5 block w-full rounded border border-neutral-300 px-2 py-1.5 text-sm">
                    <option value="">— nessuna</option>
                    {zone.map((z) => <option key={z.id} value={z.id}>{z.nome}{z.responsabileId === x.id ? " (responsabile)" : ""}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-neutral-700" title="Responsabile del suo ufficio (es. Rocco per il Marketing)">
                  <input type="checkbox" name="responsabileUfficio" defaultChecked={x.responsabileUfficio} /> Resp. ufficio{x.ufficio ? ` ${nomeUfficio(x.ufficio)}` : ""}
                </label>
                {p.salvato === x.id
                  ? <button className="btn-3d btn-3d-green px-3 py-1.5 text-xs">✓ Salvato</button>
                  : <button className="btn-3d btn-3d-blue px-3 py-1.5 text-xs">Salva</button>}
                {prof && <span className="text-[11px] text-violet-700 md:col-span-5">Profilo: {prof.nome}</span>}
              </form>
            );
          })}
        </div>
      </section>

      <section className="card-fase" style={{ ["--fase" as string]: "#7c3aed" }}>
        <h2>🧩 Profili ({profili.length})</h2>
        <div className="mt-3 space-y-3">
          {profili.map((pr) => {
            const membri = utenti.filter((x) => x.profiloId === pr.id);
            return (
              <details key={pr.id} id={`profilo-${pr.id}`} open={p.aperto === pr.id} className="group rounded-lg border border-neutral-200 bg-white">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-neutral-50">
                  <span className="flex items-center gap-2">
                    <span className="text-neutral-400 transition-transform group-open:rotate-90">▶</span>
                    <b className="text-neutral-900">{pr.nome}</b>
                    <span className="hidden text-xs text-neutral-500 sm:inline">{pr.descrizione}</span>
                  </span>
                  <span className="flex flex-wrap gap-1 text-xs">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-800">vede: {nomeVis(pr.visibilita)}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700">{pr.permessi.length} sezioni</span>
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-800">{membri.length} {membri.length === 1 ? "persona" : "persone"}</span>
                  </span>
                </summary>
                <div className="border-t border-neutral-100 px-4 pb-4 pt-3">
                  <form action={salvaProfilo} className="space-y-4">
                    <input type="hidden" name="id" value={pr.id} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-xs font-bold text-neutral-700">Nome<input name="nome" defaultValue={pr.nome} className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1.5 text-sm font-normal" /></label>
                      <label className="text-xs font-bold text-neutral-700">Descrizione<input name="descrizione" defaultValue={pr.descrizione ?? ""} className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1.5 text-sm font-normal" /></label>
                    </div>
                    <fieldset>
                      <legend className="mb-1 text-xs font-bold text-neutral-700">Quali dati vede</legend>
                      <div className="grid gap-2 md:grid-cols-3">
                        {VISIBILITA.map((v) => (
                          <label key={v.chiave} className="flex cursor-pointer gap-2 rounded-lg border border-neutral-200 p-2 text-sm has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                            <input type="radio" name="visibilita" value={v.chiave} defaultChecked={pr.visibilita === v.chiave} className="mt-0.5" />
                            <span><b>{v.nome}</b><span className="block text-[11px] text-neutral-600">{v.spiega}</span></span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend className="mb-1 text-xs font-bold text-neutral-700">Cosa può vedere e fare</legend>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {AREE.map((a) => (
                          <div key={a.area} className="rounded-lg border border-neutral-200 p-2">
                            <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-neutral-500">{a.area}</div>
                            {a.voci.map(([k, nome]) => (
                              <label key={k} className="flex items-start gap-2 py-0.5 text-sm">
                                <input type="checkbox" name={`p:${k}`} defaultChecked={pr.permessi.includes(k)} className="mt-1" /> {nome}
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    </fieldset>
                    {membri.length > 0 && <p className="text-xs text-neutral-600">Ce l&apos;hanno: {membri.map((m) => m.nome).join(", ")}. Salvando si aggiornano anche loro.</p>}
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-3d btn-3d-green px-4 py-2 text-sm">💾 Salva il profilo</button>
                      {p.salvato === pr.id && <span className="self-center rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-800">✓ Salvato e aggiornato</span>}
                      <button formAction={eliminaProfilo} className="btn-3d btn-3d-outline px-3 py-2 text-xs">Elimina profilo</button>
                    </div>
                  </form>
                </div>
              </details>
            );
          })}
        </div>
        <form action={salvaProfilo} className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-neutral-300 bg-white p-3">
          <label className="text-xs font-bold text-neutral-700">Nuovo profilo<input name="nome" required placeholder="es. Capo area Lombardia" className="mt-1 block w-64 rounded border border-neutral-300 px-2 py-1.5 text-sm font-normal" /></label>
          <label className="text-xs font-bold text-neutral-700">Partendo da
            <select name="copiaDa" className="mt-1 block rounded border border-neutral-300 px-2 py-1.5 text-sm font-normal">
              <option value="">— vuoto</option>
              {profili.map((pr) => <option key={pr.id} value={pr.id}>{pr.nome}</option>)}
            </select>
          </label>
          <button className="btn-3d btn-3d-purple px-4 py-2 text-sm">+ Crea profilo</button>
        </form>
      </section>
    </div>
  );
}
