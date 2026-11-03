export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { APP_URL } from "@/lib/mail/invio";
import { firmaDi, firmaHtml } from "@/lib/mail/firma";
import { riempi, valoriPer, htmlDaTesto } from "@/lib/comunicazioni/testo";
import { segnaComunicazione } from "@/app/comunicazioni-actions";
import EditorComunicazione from "@/components/comunicazioni/EditorComunicazione";

type P = { ok?: string; errore?: string; inviata?: string; nuova?: string };
const quando = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const giorno = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit" });

/** Comunicazioni interne: quelle ricevute (con i task da fare) per tutti; il modulo per scriverle e lo storico per amministratore e marketing. */
export default async function ComunicazioniPage({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const p = await searchParams;
  const mittente = puo(u, "comunicazioni") || puo(u, "marketing");
  const [ricevute, inviate, utenti] = await Promise.all([
    prisma.comunicazioneDestinatario.findMany({ where: { utenteId: u.id }, include: { comunicazione: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    mittente ? prisma.comunicazione.findMany({ include: { destinatari: { orderBy: { nome: "asc" } } }, orderBy: { createdAt: "desc" }, take: 30 }) : Promise.resolve([]),
    mittente ? prisma.utente.findMany({ where: { stato: "ATTIVO" }, select: { id: true, nome: true, email: true, username: true, ruolo: true, ufficio: true }, orderBy: { nome: "asc" } }) : Promise.resolve([]),
  ]);
  // prima i task da fare e le comunicazioni non lette
  const ordinate = [...ricevute].sort((a, b) => {
    const peso = (r: typeof a) => (r.comunicazione.conTask && !r.fattoIl ? 0 : !r.lettaIl ? 1 : 2);
    return peso(a) - peso(b) || b.createdAt.getTime() - a.createdAt.getTime();
  });
  const mostraEditor = mittente && (p.nuova === "1" || inviate.length === 0 || !!p.errore);

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold text-neutral-900">💬 Comunicazioni interne</h1>
          <p className="text-sm text-neutral-600">Messaggi e compiti dal team. {mittente ? "Scrivi a chi vuoi del team: arriva per email e, se serve, come task da segnare «fatto»." : ""}</p>
        </div>
        {mittente && !mostraEditor && <a href="/comunicazioni?nuova=1" className="btn-3d btn-3d-green px-4 py-2 text-sm">✉️ Nuova comunicazione</a>}
      </div>
      {p.ok && <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">✅ {p.ok}</p>}
      {p.errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{p.errore}</p>}

      {mostraEditor && (
        <section className="card-fase" style={{ ["--fase" as string]: "#16a34a" }}>
          <h2>✉️ Nuova comunicazione al team</h2>
          <div className="mt-3">
            <EditorComunicazione utenti={utenti} admin={isAmministratore(u)} link={APP_URL} firmaHtml={firmaHtml(firmaDi(u))} mioId={u.id} />
          </div>
        </section>
      )}

      <section className="card-fase" style={{ ["--fase" as string]: "#ea580c" }}>
        <h2>📥 Ricevute da te ({ricevute.filter((r) => (r.comunicazione.conTask && !r.fattoIl) || !r.lettaIl).length} da vedere)</h2>
        {ordinate.length === 0 && <p className="mt-2 text-sm text-neutral-500">Nessuna comunicazione per ora.</p>}
        <div className="mt-3 space-y-2">
          {ordinate.map((r) => {
            const c = r.comunicazione;
            const valori = valoriPer({ id: u.id, nome: u.nome, email: u.email, username: u.username, ruolo: u.ruolo, ufficio: u.ufficio }, { link: APP_URL, password: c.conPassword && c.mittenteId !== u.id ? "(te l'abbiamo mandata per email)" : null });
            const daFare = c.conTask && !r.fattoIl;
            return (
              <details key={r.id} id={`r-${r.id}`} open={daFare || !r.lettaIl} className={`rounded-lg border bg-white ${daFare ? "border-amber-300" : "border-neutral-200"}`}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span className="text-sm">
                    {!r.lettaIl && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-600" aria-label="non letta" />}
                    <b>{riempi(c.oggetto, valori)}</b> <span className="text-xs text-neutral-500">· da {c.mittenteNome} · {quando(c.createdAt)}</span>
                  </span>
                  {c.conTask && (r.fattoIl
                    ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">✓ fatto il {giorno(r.fattoIl)}</span>
                    : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">📌 {c.titoloTask}{c.scadenzaTask ? ` · entro ${giorno(c.scadenzaTask)}` : ""}</span>)}
                </summary>
                <div className="border-t border-neutral-100 px-4 py-3">
                  <div className="text-sm text-neutral-800" dangerouslySetInnerHTML={{ __html: htmlDaTesto(riempi(c.testo, valori)) }} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.conTask && (
                      <form action={segnaComunicazione}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="cosa" value="fatto" />
                        <button className={`btn-3d ${r.fattoIl ? "btn-3d-outline" : "btn-3d-green"} px-3 py-1.5 text-xs`}>{r.fattoIl ? "↺ Non ancora fatto" : "✓ Fatto"}</button></form>
                    )}
                    {!r.lettaIl && (
                      <form action={segnaComunicazione}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="cosa" value="letta" />
                        <button className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">👁️ Letta</button></form>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {mittente && inviate.length > 0 && (
        <section className="card-fase" style={{ ["--fase" as string]: "#334155" }}>
          <h2>📤 Inviate al team</h2>
          <div className="mt-3 space-y-2">
            {inviate.map((c) => {
              const ok = c.destinatari.filter((d) => d.stato === "INVIATA").length;
              const lette = c.destinatari.filter((d) => d.lettaIl).length;
              const fatti = c.destinatari.filter((d) => d.fattoIl).length;
              return (
                <details key={c.id} open={p.inviata === c.id} className="rounded-lg border border-neutral-200 bg-white">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span><b>{c.oggetto}</b> <span className="text-xs text-neutral-500">· {c.mittenteNome} · {quando(c.createdAt)}</span></span>
                    <span className="text-xs text-neutral-700">✉️ {ok}/{c.destinatari.length} ricevuta · 👁️ {lette} letta{c.conTask ? ` · 📌 ${fatti}/${c.destinatari.length} fatto` : ""}</span>
                  </summary>
                  <div className="overflow-x-auto border-t border-neutral-100 px-4 py-2">
                    <table className="w-full text-xs">
                      <thead className="text-left text-neutral-500"><tr><th className="py-1">Persona</th><th>Email</th><th>Letta</th>{c.conTask && <th>Task</th>}</tr></thead>
                      <tbody className="divide-y divide-neutral-100">
                        {c.destinatari.map((d) => (
                          <tr key={d.id}>
                            <td className="py-1 font-semibold">{d.nome}</td>
                            <td className={d.stato === "INVIATA" ? "text-green-800" : "text-red-700"}>{d.stato === "INVIATA" ? `✓ ${d.email}` : `✗ ${d.motivo ?? "non inviata"}`}</td>
                            <td>{d.lettaIl ? giorno(d.lettaIl) : "—"}</td>
                            {c.conTask && <td>{d.fattoIl ? <span className="text-green-800">✓ {giorno(d.fattoIl)}</span> : <span className="text-amber-800">da fare</span>}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {c.conPassword && <p className="mt-1 text-[11px] text-neutral-500">🔑 Con password provvisoria nuova per chi l&apos;ha ricevuta (non salvata qui).</p>}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
