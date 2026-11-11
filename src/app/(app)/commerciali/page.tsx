export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { impostaStatoUtente } from "@/app/team-actions";
import { STATI_UTENTE, statoUtente } from "@/lib/utenti/stato";
import { contrattiDi, eVenditore } from "@/lib/provvigioni/server";
import { vendutoNelPeriodo } from "@/lib/provvigioni/obiettivi";
import { sigleDi } from "@/lib/provvigioni/calcoli";
import { SIGLE_COMMERCIALI, NOMI_COMMERCIALI } from "@/lib/clienti/bconsole";
import { chiaveGiorno } from "@/lib/calendario/tempo";

export default async function CommercialiPage({ searchParams }: { searchParams: Promise<{ ok?: string; errore?: string }> }) {
  const msg = await searchParams;
  const utenteCorrente = await getCurrentUser();
  if (!utenteCorrente) redirect("/login");
  if (!isAmministratore(utenteCorrente)) redirect(`/commerciali/${utenteCorrente.id}`);

  const utenti = await prisma.utente.findMany({
    include: {
      brandAutorizzati: true,
      preventivi: true,
      appuntamenti: true,
    },
    orderBy: { nome: "asc" },
  });
  // prima chi lavora, poi chi è in pausa, in fondo i disattivati
  const ordine = (st: string) => STATI_UTENTE.findIndex((x) => x.chiave === st);
  utenti.sort((a, b) => ordine(a.stato) - ordine(b.stato));
  // venduto dell'anno: contratti del CRM e storico BConsole (fatture con la sua sigla), come in «Contratti e provvigioni»
  const anno = chiaveGiorno(new Date()).slice(0, 4);
  const venditori = utenti.filter((u) => eVenditore(u) || u.preventivi.length > 0 || sigleDi(u, SIGLE_COMMERCIALI, NOMI_COMMERCIALI).length > 0);
  const contratti = await contrattiDi(venditori.map((u) => ({ id: u.id, nome: u.nome, username: u.username })));
  const vendutoDi = (id: string) => vendutoNelPeriodo(contratti.filter((c) => c.commercialeId === id), anno);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-neutral-900 mb-2">Team &amp; performance</h1>
      <p className="text-sm text-neutral-600 mb-4">
        Stato di ogni persona: <b>Attivo</b> · <b>In pausa</b> (assente per un periodo: non entra e non riceve lavoro nuovo) ·{" "}
        <b>Disattivato</b> (non lavora più con noi: i suoi dati restano). Apri il nome per cambiare mansione, passare il suo lavoro a un collega o eliminarlo.
      </p>
      {msg.ok && <p className="mb-3 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {msg.ok}</p>}
      {msg.errore && <p className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{msg.errore}</p>}

      <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-neutral-600 bg-neutral-50 border-b-2 border-neutral-200">
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Ruolo</th>
              <th className="px-4 py-2 font-medium">Stato</th>
              <th className="px-4 py-2 font-medium">Listini abilitati</th>
              <th className="px-4 py-2 font-medium text-right">Venduto {anno}<span className="block normal-case font-normal">CRM + BConsole</span></th>
              <th className="px-4 py-2 font-medium text-right">Preventivi accettati</th>
              <th className="px-4 py-2 font-medium text-right">Valore accettato</th>
              <th className="px-4 py-2 font-medium text-right">Appuntamenti</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {utenti.map((u) => {
              const accettati = u.preventivi.filter((p) => p.stato === "ACCETTATO");
              const valoreAccettato = accettati.reduce((s, p) => s + p.totaleNetto, 0);
              return (
                <tr key={u.id} className={u.stato === "ATTIVO" ? "" : "bg-neutral-50 text-neutral-500"}>
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/commerciali/${u.id}`} className="hover:underline text-blue-700">
                      {u.nome}
                    </Link>
                    <span className="block text-xs text-neutral-600 font-normal">{u.email}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600">{u.ruolo}</span>
                  </td>
                  <td className="px-4 py-2">
                    <form action={impostaStatoUtente} className="flex items-center gap-1">
                      <input type="hidden" name="utenteId" value={u.id} />
                      <input type="hidden" name="nota" value={u.statoNota ?? ""} />
                      <select name="stato" defaultValue={u.stato} aria-label={`Stato di ${u.nome}`} className={`text-xs rounded px-1.5 py-1 border border-neutral-200 ${statoUtente(u.stato).classe}`}>
                        {STATI_UTENTE.map((x) => <option key={x.chiave} value={x.chiave}>{x.nome}</option>)}
                      </select>
                      <button className="btn-3d btn-3d-outline text-[11px] px-2 py-1">Salva</button>
                    </form>
                    {u.stato !== "ATTIVO" && (u.statoNota || u.statoDal) && (
                      <span className="block text-[11px] text-neutral-500 mt-0.5">{u.statoDal ? `dal ${u.statoDal.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}` : ""}{u.statoNota ? ` · ${u.statoNota}` : ""}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-700">
                    {u.brandAutorizzati.length > 0 ? u.brandAutorizzati.map((b) => b.nome).join(", ") : "— tutti (nessuna restrizione impostata)"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {venditori.some((v) => v.id === u.id)
                      ? <Link href={`/contratti?persona=${u.id}&anno=${anno}`} className="font-semibold text-blue-800 hover:underline">{vendutoDi(u.id).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}</Link>
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">{accettati.length}</td>
                  <td className="px-4 py-2 text-right">{valoreAccettato.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</td>
                  <td className="px-4 py-2 text-right">{u.appuntamenti.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {utenti.length === 0 && <p className="px-4 py-6 text-sm text-neutral-600">Nessun utente ancora.</p>}
      </div>
    </div>
  );
}
