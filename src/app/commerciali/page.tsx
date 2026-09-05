export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function CommercialiPage() {
  const utenti = await prisma.utente.findMany({
    include: {
      brandAutorizzati: true,
      preventivi: true,
      appuntamenti: true,
    },
    orderBy: { nome: "asc" },
  });

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Team &amp; performance</h1>

      <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-neutral-600 bg-neutral-50 border-b-2 border-neutral-200">
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Ruolo</th>
              <th className="px-4 py-2 font-medium">Listini abilitati</th>
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
                <tr key={u.id}>
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/commerciali/${u.id}`} className="hover:underline text-blue-700">
                      {u.nome}
                    </Link>
                    <span className="block text-xs text-neutral-600 font-normal">{u.email}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600">{u.ruolo}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-700">
                    {u.brandAutorizzati.length > 0 ? u.brandAutorizzati.map((b) => b.nome).join(", ") : "— tutti (nessuna restrizione impostata)"}
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
