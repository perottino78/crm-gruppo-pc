import { prisma } from "@/lib/prisma";

export default async function ImpostazioniPage() {
  const config = await prisma.configurazione.findMany();
  const utenti = await prisma.utente.findMany();

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-medium mb-6">Impostazioni</h1>

      <h2 className="text-sm font-medium text-neutral-700 mb-3">Configurazione listino e IVA</h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-8">
        {config.map((c) => (
          <div key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-neutral-500">{c.chiave}</span>
            <span className="font-medium">{c.valore}</span>
          </div>
        ))}
      </div>

      <h2 className="text-sm font-medium text-neutral-700 mb-3">Utenti e ruoli</h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
        {utenti.map((u) => (
          <div key={u.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>{u.nome}</span>
            <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600">{u.ruolo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
