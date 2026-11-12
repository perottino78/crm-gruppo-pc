// Impostazioni › Lead › «Esito degli appuntamenti»: promemoria al commerciale, lista del centralino, blocco facoltativo e sblocco.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { bloccato } from "@/lib/appuntamenti/esiti";
import { appuntamentiSenzaEsito, regoleEsiti } from "@/lib/appuntamenti/esiti-server";
import { salvaRegoleEsiti, sbloccaEsiti } from "@/app/esiti-actions";

export default async function RegoleEsiti() {
  const r = await regoleEsiti();
  const aperti = await appuntamentiSenzaEsito({ giorni: r.giorniPromemoria, regole: r });
  const perUtente = new Map<string, { nome: string; n: number; lista: number }>();
  for (const a of aperti) {
    const x = perUtente.get(a.utenteId) ?? { nome: a.utente, n: 0, lista: 0 };
    x.n++; if (a.giorni >= r.giorniLista) x.lista++;
    perUtente.set(a.utenteId, x);
  }
  const sbloccatiNomi = new Map((await prisma.utente.findMany({ where: { id: { in: r.sbloccati } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  const righe = [...perUtente.entries()].sort((a, b) => b[1].n - a[1].n);
  const bloccatiOra = righe.filter(([id, x]) => bloccato(id, x.n, r)).map(([id]) => id);
  const campo = "rounded border border-neutral-300 px-2 py-1 text-sm";
  return (
    <section id="esiti" className="bg-white rounded-lg border border-neutral-200 p-4 scroll-mt-4 space-y-3">
      <div>
        <h2 className="font-bold text-neutral-900 mb-1">📋 Esito degli appuntamenti</h2>
        <p className="text-xs text-neutral-600">
          Quando il commerciale segna una visita «✅ Svolto» il task del centralino si chiude da solo. Se non la esita, gli arriva un promemoria
          (email ogni mattina + riquadro rosso in Dashboard) e dopo qualche giorno l&apos;appuntamento passa nella lista
          {" "}<Link href="/lead/senza-esito" className="underline text-blue-800">«Appuntamenti senza esito»</Link> del centralino.
        </p>
      </div>
      <form action={salvaRegoleEsiti} className="flex flex-wrap items-end gap-3 text-xs">
        <label>Promemoria al commerciale dopo (giorni)<input name="giorniPromemoria" type="number" min={1} max={30} defaultValue={r.giorniPromemoria} className={`${campo} block w-24`} /></label>
        <label>Nella lista del centralino dopo (giorni)<input name="giorniLista" type="number" min={1} max={60} defaultValue={r.giorniLista} className={`${campo} block w-24`} /></label>
        <label>Conta gli appuntamenti dal<input name="dal" type="date" defaultValue={r.dal} className={`${campo} block`} /></label>
        <label className="flex items-center gap-2 rounded border border-neutral-200 px-2 py-1.5">
          <input type="checkbox" name="bloccoAttivo" defaultChecked={r.bloccoAttivo} />
          <span><b>Blocco</b>: con almeno</span>
          <input name="sogliaBlocco" type="number" min={1} max={50} defaultValue={r.sogliaBlocco} className={`${campo} w-16`} />
          <span>appuntamenti senza esito il centralino non gli può dare nuovi appuntamenti</span>
        </label>
        <button className="btn-3d btn-3d-green px-3 py-1.5 text-xs">💾 Salva le regole</button>
      </form>
      <p className="text-xs font-semibold">{r.bloccoAttivo ? "🔒 Blocco acceso" : "🔓 Blocco spento: nessuno viene bloccato, partono solo promemoria e lista."}</p>
      {righe.length === 0 ? <p className="text-sm text-green-800">✅ Nessun appuntamento da esitare.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-neutral-500"><th className="py-1">Commerciale</th><th>Da esitare</th><th>Di cui nella lista del centralino</th><th></th></tr></thead>
          <tbody>
            {righe.map(([id, x]) => {
              const b = bloccato(id, x.n, r), sb = r.sbloccati.includes(id);
              return (
                <tr key={id} className="border-t border-neutral-100">
                  <td className="py-1 font-semibold">{x.nome}</td>
                  <td>{x.n}</td>
                  <td>{x.lista}</td>
                  <td className="text-right">
                    {b && <span className="mr-2 rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">bloccato</span>}
                    {r.bloccoAttivo && (
                      <form action={sbloccaEsiti} className="inline">
                        <input type="hidden" name="utenteId" value={id} /><input type="hidden" name="azione" value={sb ? "riblocca" : "sblocca"} />
                        <button className="btn-3d btn-3d-outline px-2 py-0.5 text-xs">{sb ? "Rimetti il blocco" : "🔓 Sblocca"}</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {r.bloccoAttivo && bloccatiOra.length > 1 && (
        <form action={sbloccaEsiti}>
          <input type="hidden" name="azione" value="tutti" /><input type="hidden" name="ids" value={bloccatiOra.join(",")} />
          <button className="btn-3d btn-3d-outline px-3 py-1 text-xs">🔓 Sblocca tutti ({bloccatiOra.length})</button>
        </form>
      )}
      {r.sbloccati.length > 0 && r.bloccoAttivo && <p className="text-xs text-neutral-500">Sbloccati a mano: {r.sbloccati.map((id) => sbloccatiNomi.get(id) ?? "?").join(", ")}</p>}
    </section>
  );
}
