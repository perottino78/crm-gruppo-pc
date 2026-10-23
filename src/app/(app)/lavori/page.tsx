export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { numeroCommessa } from "@/lib/commesse";

export default async function LavoriPage() {
  const u = await getCurrentUser();
  const tutti = u?.ruolo === "AMMINISTRATORE" || u?.ruolo === "AMMINISTRATIVO";
  const [pose, rilievi] = await Promise.all([
    prisma.posa.findMany({
      where: { stato: { in: ["PROGRAMMATA", "IN_CORSO"] }, ...(tutti ? {} : { assegnatoUtenteId: u?.id }) },
      include: { commessa: { include: { cliente: true } } },
      orderBy: { dataInizio: "asc" },
    }),
    prisma.rilievo.findMany({
      where: { stato: "PROGRAMMATO", ...(tutti ? {} : { tecnicoId: u?.id }) },
      include: { commessa: { include: { cliente: true } }, tecnico: true },
      orderBy: { dataOra: "asc" },
    }),
  ]);
  const card = "block bg-white rounded-lg border border-neutral-200 p-3 hover:border-neutral-400";
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-neutral-900 mb-1">{tutti ? "Lavori in programma" : "I miei lavori"}</h1>
      <p className="text-sm text-neutral-700 mb-5">Rilievi e pose assegnati: apri il lavoro per caricare misure, foto e chiudere la posa.</p>

      <h2 className="text-sm font-bold text-neutral-900 mb-2">Rilievi misure</h2>
      <div className="space-y-2 mb-6">
        {rilievi.map((r) => (
          <Link key={r.id} href={`/commesse/${r.commessaId}`} className={card}>
            <p className="text-sm font-semibold text-neutral-900">📅 {r.dataOra.toLocaleString("it-IT", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {r.commessa.cliente.nome}</p>
            <p className="text-xs text-neutral-700">{numeroCommessa(r.commessa)}{r.indirizzo ? ` · 📍 ${r.indirizzo}` : ""}{tutti ? ` · ${r.tecnico.nome}` : ""}</p>
          </Link>
        ))}
        {rilievi.length === 0 && <p className="text-xs text-neutral-600">Nessun rilievo in programma.</p>}
      </div>

      <h2 className="text-sm font-bold text-neutral-900 mb-2">Pose</h2>
      <div className="space-y-2">
        {pose.map((p) => (
          <Link key={p.id} href={`/commesse/${p.commessaId}`} className={card}>
            <p className="text-sm font-semibold text-neutral-900">🛠️ dal {p.dataInizio.toLocaleDateString("it-IT")} · {p.commessa.cliente.nome} <span className="text-xs font-normal text-neutral-600">({p.stato.replace("_", " ").toLowerCase()})</span></p>
            <p className="text-xs text-neutral-700">{numeroCommessa(p.commessa)}{p.indirizzo ? ` · 📍 ${p.indirizzo}` : ""}{tutti && p.assegnatoNome ? ` · ${p.assegnatoNome}` : ""}</p>
          </Link>
        ))}
        {pose.length === 0 && <p className="text-xs text-neutral-600">Nessuna posa in programma.</p>}
      </div>
    </div>
  );
}
