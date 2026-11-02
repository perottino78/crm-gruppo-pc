export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { creaCampagna, puoFareCampagne } from "@/app/campagne-actions";
import { giorniAllaScadenza, testoGiorni } from "@/lib/campagne/regole";

const STATO: Record<string, string> = { BOZZA: "📝 Bozza", IN_INVIO: "📤 In invio", INVIATA: "✅ Inviata" };

/** Campagne email di marketing: elenco con scadenze e risultati. */
export default async function CampagnePage({ searchParams }: { searchParams: Promise<{ errore?: string }> }) {
  const u = await getCurrentUser();
  if (!(await puoFareCampagne(u))) notFound();
  const p = await searchParams;
  const campagne = await prisma.campagna.findMany({
    orderBy: { createdAt: "desc" },
    include: { invii: { select: { stato: true, apertaIl: true, clicIl: true } } },
  });
  const adesso = new Date();
  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">📣 Campagne</h1>
          <p className="text-sm text-neutral-600">Email promozionali ai clienti filtrati per marchio, stato (comprato, non interessato, visitato…) e provenienza. 3-2-1 giorni prima della scadenza arriva l&apos;avviso di aggiornarle.</p>
        </div>
        <form action={creaCampagna} className="flex gap-2">
          <input name="nome" required placeholder="Nome della campagna (es. Pergole primavera)" className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-72" />
          <button className="btn-3d btn-3d-green text-sm px-4 py-2">+ Nuova campagna</button>
        </form>
      </div>
      {p.errore === "permesso" && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">Le campagne le gestiscono l&apos;amministratore e l&apos;ufficio Marketing.</p>}
      <div className="space-y-2">
        {campagne.map((c) => {
          const n = (s: string) => c.invii.filter((i) => i.stato === s).length;
          const g = c.validaFino ? giorniAllaScadenza(c.validaFino, adesso) : null;
          return (
            <Link key={c.id} href={`/campagne/${c.id}`} className="card-fase block bg-white rounded-lg border border-neutral-200 p-4 hover:border-neutral-400">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-neutral-900">{c.nome} <span className="text-xs font-normal text-neutral-500">{STATO[c.stato] ?? c.stato}</span></p>
                {g !== null && <span className={`text-xs px-2 py-0.5 rounded-full ${g < 0 ? "bg-neutral-200 text-neutral-700" : g <= 3 ? "bg-red-100 text-red-800 font-semibold" : "bg-green-50 text-green-800"}`}>{g < 0 ? "scaduta" : `scade ${testoGiorni(g)}`} · {c.validaFino!.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}</span>}
              </div>
              <p className="text-xs text-neutral-600 mt-1">
                {[c.marchi.join(", ") || "tutti i marchi", c.stati.join(", ") || "tutti gli stati", c.categorie.join(", ") || "lead e clienti"].join(" · ")}
              </p>
              {c.invii.length > 0 && <p className="text-xs text-neutral-700 mt-1">✉️ {n("INVIATA")} inviate · {n("IN_ATTESA") + n("IN_CORSO")} in coda · {n("FALLITA")} non inviate · {n("SOPPRESSA")} disiscritti
                {n("RIMBALZATA") > 0 && <span className="text-red-700"> · 📭 {n("RIMBALZATA")} rimbalzate</span>}{n("INVIATA") > 0 && <> · <b>👁 {Math.round((c.invii.filter((i) => i.apertaIl).length / n("INVIATA")) * 100)}% aperte</b> · <b>👆 {Math.round((c.invii.filter((i) => i.clicIl).length / n("INVIATA")) * 100)}% clic</b></>}</p>}
            </Link>
          );
        })}
        {campagne.length === 0 && <p className="text-sm text-neutral-600">Nessuna campagna ancora: creane una qui sopra.</p>}
      </div>
    </div>
  );
}
