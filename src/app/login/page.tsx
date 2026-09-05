import { login } from "@/app/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; next?: string }>;
}) {
  const { errore, next } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <span
            className="inline-flex w-14 h-14 rounded-xl items-center justify-center text-white text-xl font-extrabold shadow-sm mb-3"
            style={{ background: "linear-gradient(135deg, #ea580c, #111827)" }}
          >
            PC
          </span>
          <h1 className="text-2xl font-bold text-neutral-900">Gruppo P&amp;C</h1>
          <p className="text-sm font-medium text-neutral-600">Accedi al CRM Gestionale</p>
        </div>

        <form action={login} className="bg-white rounded-lg border border-neutral-200 p-6 flex flex-col gap-4">
          {next && <input type="hidden" name="next" value={next} />}

          {errore && (
            <div className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              Username o password non corretti.
            </div>
          )}

          <div>
            <label className="text-sm font-bold text-neutral-900 block mb-1">Username</label>
            <input
              type="text"
              name="username"
              required
              autoFocus
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm"
              placeholder="nome.cognome oppure email"
            />
          </div>
          <div>
            <label className="text-sm font-bold text-neutral-900 block mb-1">Password</label>
            <input
              type="password"
              name="password"
              required
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="btn-3d btn-3d-orange w-full mt-2">
            Accedi
          </button>
          <p className="text-xs text-neutral-500 text-center mt-1">
            Password dimenticata? Contatta l&apos;amministratore per un reset.
          </p>
        </form>
      </div>
    </div>
  );
}
