export const dynamic = "force-dynamic";

// Registro «chi ha fatto cosa» e cestino (richiesta di Ugo 15/11/2026): quello che viene eliminato resta 30 giorni e si ripristina da qui.
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { ripristinaDalCestino } from "@/app/registro-actions";
import BottoneConferma from "@/components/BottoneConferma";

const quando = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const TIPO: Record<string, string> = { CAMPAGNA: "📣 Campagna", LEAD: "📞 Lead", CLIENTE: "👤 Cliente" };
const AZIONE: Record<string, string> = { ELIMINATO: "🗑 eliminato", RIPRISTINATO: "♻️ ripristinato" };

export default async function RegistroPage({ searchParams }: { searchParams: Promise<{ ok?: string; errore?: string; q?: string }> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "registro")) redirect("/impostazioni");
  const p = await searchParams;
  const q = p.q?.trim();
  const [cestino, registro] = await Promise.all([
    prisma.cestino.findMany({ where: { ripristinatoIl: null }, orderBy: { eliminatoIl: "desc" }, take: 200, select: { id: true, tipo: true, nome: true, eliminatoDaNome: true, eliminatoIl: true, scadeIl: true } }),
    prisma.registroAmministrazione.findMany({
      where: q ? { OR: [{ dettaglio: { contains: q, mode: "insensitive" } }, { utenteNome: { contains: q, mode: "insensitive" } }, { entita: { contains: q, mode: "insensitive" } }, { azione: { contains: q, mode: "insensitive" } }] } : {},
      orderBy: { createdAt: "desc" }, take: 300,
    }),
  ]);
  return (
    <div className="max-w-5xl space-y-4">
      <Link href="/impostazioni" className="btn-indietro">← Impostazioni</Link>
      <div>
        <h1 className="text-2xl font-extrabold text-neutral-900">🗂️ Registro e cestino</h1>
        <p className="text-sm text-neutral-600">Chi ha fatto cosa, e quello che è stato eliminato: campagne, lead e clienti restano nel cestino 30 giorni con tutti i loro dati e si rimettono com&apos;erano con «Ripristina».</p>
      </div>
      {p.ok && <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">✅ {p.ok}</p>}
      {p.errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{p.errore}</p>}

      <section className="card-fase" style={{ "--fase": "#dc2626" } as React.CSSProperties}>
        <h2>🗑 Cestino</h2>
        {cestino.length === 0 ? <p className="text-sm text-neutral-500">Il cestino è vuoto.</p> : (
          <div className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">
            {cestino.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900">{TIPO[c.tipo] ?? c.tipo} · {c.nome}</p>
                  <p className="text-xs text-neutral-500">eliminato il {quando(c.eliminatoIl)}{c.eliminatoDaNome ? ` da ${c.eliminatoDaNome}` : ""} · si cancella del tutto il {c.scadeIl.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}</p>
                </div>
                <form action={ripristinaDalCestino}><input type="hidden" name="id" value={c.id} />
                  <BottoneConferma messaggio={`Ripristinare «${c.nome}»?`} className="btn-3d btn-3d-green px-3 py-1.5 text-xs">♻️ Ripristina</BottoneConferma>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card-fase" style={{ "--fase": "#475569" } as React.CSSProperties}>
        <h2>📜 Chi ha fatto cosa</h2>
        <form className="mb-2 flex gap-2"><input name="q" defaultValue={q ?? ""} placeholder="Cerca per nome, persona, azione…" className="w-72 max-w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm" /><button className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">Cerca</button></form>
        <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500"><tr><th className="px-3 py-2">Quando</th><th className="px-3 py-2">Chi</th><th className="px-3 py-2">Cosa</th><th className="px-3 py-2">Dettaglio</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {registro.map((r) => (
                <tr key={r.id}><td className="whitespace-nowrap px-3 py-1.5 text-xs text-neutral-600">{quando(r.createdAt)}</td><td className="px-3 py-1.5">{r.utenteNome ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{(TIPO[r.entita] ?? r.entita)} {AZIONE[r.azione] ?? r.azione.toLowerCase()}</td><td className="px-3 py-1.5 text-neutral-700">{r.dettaglio ?? ""}</td></tr>
              ))}
              {registro.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-sm text-neutral-500">Niente da mostrare.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
