import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cambiaPassword, aggiornaUsername } from "@/app/actions";

export default async function ProfiloPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; ok?: string }>;
}) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");
  const { errore, ok } = await searchParams;

  return (
    <div className="max-w-lg flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Il mio profilo</h1>
        <p className="text-sm font-medium text-neutral-600">{utente.nome} · {utente.ruolo}</p>
      </div>

      {utente.mustChangePassword && (
        <div className="text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Per sicurezza, imposta una nuova password personale prima di continuare.
        </div>
      )}
      {errore && (
        <div className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {errore}
        </div>
      )}
      {ok && (
        <div className="text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
          Password aggiornata correttamente.
        </div>
      )}

      <div className="bg-white rounded-lg border border-neutral-200 p-5">
        <h2 className="text-base font-bold text-neutral-900 mb-3">Username</h2>
        <form action={aggiornaUsername} className="flex items-center gap-2">
          <input
            type="text"
            name="username"
            defaultValue={utente.username ?? ""}
            className="flex-1 border border-neutral-300 rounded-md px-3 py-2 text-sm"
          />
          <button className="btn-3d btn-3d-outline">Salva</button>
        </form>
        <p className="text-xs text-neutral-500 mt-2">Usato per accedere al CRM al posto della password.</p>
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 p-5">
        <h2 className="text-base font-bold text-neutral-900 mb-3">Cambia password</h2>
        <form action={cambiaPassword} className="flex flex-col gap-3">
          {!utente.mustChangePassword && (
            <div>
              <label className="text-sm font-bold text-neutral-900 block mb-1">Password attuale</label>
              <input
                type="password"
                name="passwordAttuale"
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-bold text-neutral-900 block mb-1">Nuova password</label>
            <input
              type="password"
              name="nuovaPassword"
              required
              minLength={6}
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-bold text-neutral-900 block mb-1">Conferma nuova password</label>
            <input
              type="password"
              name="conferma"
              required
              minLength={6}
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <button className="btn-3d btn-3d-orange self-start">Aggiorna password</button>
        </form>
      </div>
    </div>
  );
}
