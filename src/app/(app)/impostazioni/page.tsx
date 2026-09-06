export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { aggiornaConfigurazione, creaUtente, adminResetPassword, adminAggiornaTelefonoUtente } from "@/app/actions";
import Link from "next/link";
import { BRANDS } from "@/lib/brands";
import { getCurrentUser, isAmministratore } from "@/lib/auth";

const RUOLI = ["COMMERCIALE", "TELEFONISTA", "POSATORE", "AMMINISTRATIVO", "AMMINISTRATORE"];

export default async function ImpostazioniPage() {
  const utenteCorrente = await getCurrentUser();
  const admin = isAmministratore(utenteCorrente);

  const [config, utenti, brands] = await Promise.all([
    prisma.configurazione.findMany({ orderBy: { chiave: "asc" } }),
    admin ? prisma.utente.findMany({ orderBy: { nome: "asc" } }) : Promise.resolve([]),
    prisma.brand.findMany({ orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Impostazioni</h1>

      <h2 className="text-base font-bold text-neutral-900 mb-3">Configurazione listino e IVA</h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-8">
        {config.map((c) => (
          <form
            key={c.id}
            action={aggiornaConfigurazione}
            className="flex items-center justify-between px-4 py-3 text-sm gap-3"
          >
            <input type="hidden" name="id" value={c.id} />
            <span className="text-neutral-700">{c.chiave}</span>
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

      <h2 className="text-base font-bold text-neutral-900 mb-3">Brand attivi</h2>
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

      <h2 className="text-base font-bold text-neutral-900 mb-3">Utenti, ruoli e credenziali</h2>

      {!admin ? (
        <div className="bg-white rounded-lg border border-neutral-200 p-4 text-sm font-medium text-neutral-600">
          Sezione riservata all&apos;amministratore. Per un reset della password o dello username,
          contatta chi gestisce il CRM.
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-6">
            {utenti.map((u) => (
              <div key={u.id} className="px-4 py-3 text-sm flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Link href={`/commerciali/${u.id}`} className="text-blue-700 font-medium hover:underline">
                      {u.nome}
                    </Link>
                    <p className="text-xs text-neutral-600">
                      {u.email}
                      {u.username && <span> · username: <span className="font-mono">{u.username}</span></span>}
                      {!u.username && <span className="text-amber-700"> · nessun accesso attivato</span>}
                      {u.telefono && <span> · tel. {u.telefono}</span>}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600 shrink-0">
                    {u.ruolo}
                  </span>
                </div>
                <form action={adminResetPassword} className="flex flex-wrap items-end gap-2 pt-1 border-t border-neutral-50">
                  <input type="hidden" name="utenteId" value={u.id} />
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-neutral-600">Nuovo username</label>
                    <input
                      name="nuovoUsername"
                      placeholder={u.username ?? u.email}
                      className="border border-neutral-200 rounded px-2 py-1 text-xs w-40"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-neutral-600">Nuova password</label>
                    <input
                      name="nuovaPassword"
                      type="text"
                      placeholder="min. 6 caratteri"
                      className="border border-neutral-200 rounded px-2 py-1 text-xs w-40"
                    />
                  </div>
                  <button className="btn-3d btn-3d-outline text-[11px] px-3 py-1.5">Reset accesso</button>
                </form>
                <form action={adminAggiornaTelefonoUtente} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="utenteId" value={u.id} />
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-neutral-600">Telefono (per la stampa offerte)</label>
                    <input
                      name="telefono"
                      defaultValue={u.telefono ?? ""}
                      placeholder="es. 011 1234567"
                      className="border border-neutral-200 rounded px-2 py-1 text-xs w-40"
                    />
                  </div>
                  <button className="btn-3d btn-3d-outline text-[11px] px-3 py-1.5">Salva telefono</button>
                </form>
              </div>
            ))}
          </div>

          <form action={creaUtente} className="bg-white rounded-lg border border-neutral-200 p-4 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Nome</label>
              <input name="nome" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Email</label>
              <input name="email" type="email" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Username (opz.)</label>
              <input name="username" placeholder="lascia vuoto per usare l'email" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Password iniziale (opz.)</label>
              <input name="password" placeholder="min. 6 caratteri" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Ruolo</label>
              <select name="ruolo" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
                {RUOLI.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Aggiungi utente</button>
          </form>
        </>
      )}
    </div>
  );
}
