export const dynamic = "force-dynamic";

// Provvigioni da pagare ai commerciali nel mese (Debora 23/11/2026): la prima settimana del mese Giorgia vede quanto pagare a ciascuno.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { chiaveGiorno } from "@/lib/calendario/tempo";
import { contrattiDi, gestisceProvvigioni, personeVisibili } from "@/lib/provvigioni/server";
import { fineMesePrecedente, provvigioneDaPagare, cent } from "@/lib/provvigioni/calcoli";
import { registraLiquidazione } from "@/app/provvigioni-actions";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export default async function DaPagarePage({ searchParams }: { searchParams: Promise<{ mese?: string; ok?: string; errore?: string }> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!gestisceProvvigioni(u)) redirect("/contratti");
  const p = await searchParams;
  const oggi = chiaveGiorno(new Date());
  const mese = /^\d{4}-\d{2}$/.test(p.mese ?? "") ? p.mese! : oggi.slice(0, 7);
  const anno = Number(mese.slice(0, 4)), m = Number(mese.slice(5, 7));
  const fine = fineMesePrecedente(anno, m);
  const prec = new Date(Date.UTC(anno, m - 2, 1)), succ = new Date(Date.UTC(anno, m, 1));
  const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  const persone = await personeVisibili(u);
  const contratti = await contrattiDi(persone);
  const righe = contratti.map((c) => ({ c, r: provvigioneDaPagare(c, fine) })).filter((x) => x.r && (x.r.daPagare > 0 || x.r.maturato > 0 || x.r.giaPagato > 0));
  const perPersona = new Map<string, typeof righe>();
  for (const x of righe) perPersona.set(x.c.commercialeNome || "—", [...(perPersona.get(x.c.commercialeNome || "—") ?? []), x]);
  const torna = `/contratti/da-pagare?mese=${mese}`;
  const totale = cent(righe.reduce((t, x) => t + x.r!.daPagare, 0));

  return (
    <div className="space-y-4">
      <Link href="/contratti" className="btn-indietro">← Contratti e provvigioni</Link>
      <h1 className="text-2xl font-bold text-neutral-900">💶 Provvigioni da pagare a {MESI[m - 1]} {anno}</h1>
      <p className="text-sm text-neutral-700">
        <b>80%</b> se il cliente ha pagato almeno il <b>50%</b> della commessa entro il {fine.toLocaleDateString("it-IT", { timeZone: "UTC" })} · <b>20%</b> a saldo se la pratica è stata posata e il cliente ha pagato tutto entro quella data.
      </p>
      <div className="flex gap-2 text-sm">
        <Link href={`/contratti/da-pagare?mese=${key(prec)}`} className="btn-3d btn-3d-outline px-3 py-1">← {MESI[prec.getUTCMonth()]}</Link>
        <Link href={`/contratti/da-pagare?mese=${key(succ)}`} className="btn-3d btn-3d-outline px-3 py-1">{MESI[succ.getUTCMonth()]} →</Link>
      </div>
      {p.ok && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✓ {p.ok}</p>}
      {p.errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">⚠️ {p.errore}</p>}
      <p className="text-lg font-semibold">Totale da pagare: {eur(totale)}</p>
      {righe.length === 0 && <p className="text-sm text-neutral-600">Nessuna provvigione inserita sui contratti: la inserisce la fatturazione dalla pagina Contratti.</p>}
      {[...perPersona.entries()].map(([nome, lista]) => (
        <section key={nome} className="rounded-xl border border-neutral-200 bg-white p-3">
          <h2 className="font-bold text-neutral-900">{nome} — da pagare {eur(cent(lista.reduce((t, x) => t + x.r!.daPagare, 0)))}</h2>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-xs text-neutral-500"><th>Contratto</th><th className="text-right">Provvigione</th><th className="text-right">Maturata</th><th className="text-right">Già pagata</th><th className="text-right">Da pagare</th><th /></tr></thead>
            <tbody>
              {lista.map(({ c, r }) => (
                <tr key={c.chiave} className="border-t border-neutral-100 align-top">
                  <td className="py-1.5">{c.href ? <Link href={c.href} className="underline">{c.numero}</Link> : c.numero} · {c.clienteNome}
                    {r!.note.length > 0 && <span className="block text-xs text-amber-800">⏳ {r!.note.join(" · ")}</span>}</td>
                  <td className="text-right">{eur(c.provvigione!.importo)}</td>
                  <td className="text-right">{eur(r!.maturato)}</td>
                  <td className="text-right">{eur(r!.giaPagato)}</td>
                  <td className="text-right font-semibold">{eur(r!.daPagare)}</td>
                  <td className="text-right">
                    {r!.daPagare > 0 && (
                      <form action={registraLiquidazione} className="inline-flex gap-1 items-center">
                        <input type="hidden" name="provvigioneId" value={c.provvigione!.id} /><input type="hidden" name="importo" value={r!.daPagare.toFixed(2)} /><input type="hidden" name="data" value={oggi} /><input type="hidden" name="torna" value={torna} />
                        <button className="btn-3d btn-3d-green text-xs px-2 py-1">✓ Segna pagata</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
