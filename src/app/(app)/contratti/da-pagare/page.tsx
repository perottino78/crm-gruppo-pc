export const dynamic = "force-dynamic";

// Provvigioni da pagare ai commerciali nel mese (Debora 23/11/2026): la prima settimana del mese Giorgia vede quanto pagare a ciascuno.
// 80% a titolo di acconto se il cliente ha pagato il 50% entro il mese scorso; 20% a saldo se la pratica è posata e tutto pagato entro il mese scorso.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { chiaveGiorno } from "@/lib/calendario/tempo";
import { contrattiDi, gestisceProvvigioni, personeVisibili } from "@/lib/provvigioni/server";
import { reportMensile, mesePrecedenteDi, MESI } from "@/lib/provvigioni/report";
import { registraLiquidazione, registraLiquidazioniMese } from "@/app/provvigioni-actions";
import PrintButton from "@/components/PrintButton";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });
const giornoUtc = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });

export default async function DaPagarePage({ searchParams }: { searchParams: Promise<{ mese?: string; ok?: string; errore?: string }> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!gestisceProvvigioni(u)) redirect("/contratti");
  const p = await searchParams;
  const oggi = chiaveGiorno(new Date());
  // il report del mese guarda la situazione alla fine del mese PRECEDENTE (es. report di dicembre = situazione al 30 novembre)
  const mese = /^\d{4}-(0[1-9]|1[0-2])$/.test(p.mese ?? "") ? p.mese! : oggi.slice(0, 7);
  const anno = Number(mese.slice(0, 4)), m = Number(mese.slice(5, 7));
  const prec = mesePrecedenteDi(mese);
  const succ = new Date(Date.UTC(anno, m, 1));
  const succKey = `${succ.getUTCFullYear()}-${String(succ.getUTCMonth() + 1).padStart(2, "0")}`;
  const nomeMese = (k: string) => `${MESI[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;

  const contratti = await contrattiDi(await personeVisibili(u));
  const { fine, gruppi, totaleDaPagare } = reportMensile(contratti, mese);
  const torna = `/contratti/da-pagare?mese=${mese}`;

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/contratti" className="btn-indietro">← Contratti e provvigioni</Link>
        <div className="flex gap-2">
          <a href={`/api/contratti/da-pagare?mese=${mese}`} className="btn-3d btn-3d-outline px-3 py-1.5 text-sm">📊 Esporta in Excel</a>
          <PrintButton />
        </div>
      </div>
      <h1 className="text-2xl font-extrabold text-neutral-900">💶 Provvigioni da pagare — {nomeMese(mese)}</h1>
      <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-neutral-800">
        Situazione al <b>{giornoUtc(fine)}</b> (fine del mese scorso). <b>80%</b> a titolo di acconto se il cliente ha pagato almeno il <b>50%</b> della commessa entro quel giorno;
        <b> 20%</b> a saldo se la pratica è stata <b>posata</b> e il cliente ha pagato tutto (anche il saldo del materiale) entro quel giorno.
        I contratti dello storico BConsole non hanno la posa in ONE: il saldo resta «da verificare».
      </p>
      <div className="flex flex-wrap gap-2 text-sm print:hidden">
        <Link href={`/contratti/da-pagare?mese=${prec}`} className="btn-3d btn-3d-outline px-3 py-1">← {nomeMese(prec)}</Link>
        <Link href={`/contratti/da-pagare?mese=${succKey}`} className="btn-3d btn-3d-outline px-3 py-1">{nomeMese(succKey)} →</Link>
      </div>
      {p.ok && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✓ {p.ok}</p>}
      {p.errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">⚠️ {p.errore}</p>}
      <p className="text-lg font-semibold">Totale da pagare: {eur(totaleDaPagare)}</p>
      {gruppi.length === 0 && <p className="text-sm text-neutral-600">Nessuna provvigione inserita sui contratti: la inserisce la fatturazione dalla pagina Contratti.</p>}
      {gruppi.map((g) => (
        <section key={g.commercialeId ?? g.nome} className="rounded-xl border border-neutral-200 bg-white p-3 break-inside-avoid">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-neutral-900">{g.nome} — da pagare {eur(g.daPagare)} <span className="text-xs font-normal text-neutral-500">(maturato {eur(g.maturato)}, già pagato {eur(g.giaPagato)})</span></h2>
            {g.daPagare > 0 && g.commercialeId && (
              <form action={registraLiquidazioniMese} className="print:hidden">
                <input type="hidden" name="utenteId" value={g.commercialeId} /><input type="hidden" name="mese" value={mese} /><input type="hidden" name="torna" value={torna} />
                <button className="btn-3d btn-3d-green px-3 py-1 text-xs">✓ Segna pagato tutto a {g.nome.split(" ")[0]} ({eur(g.daPagare)})</button>
              </form>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-xs text-neutral-500">
                <th>Cliente · commessa</th><th className="text-right">Provvigione</th><th className="text-right">80% acconto</th><th className="text-right">20% saldo</th><th className="text-right">Già pagato</th><th className="text-right">Da pagare</th><th className="print:hidden" />
              </tr></thead>
              <tbody>
                {g.righe.map(({ c, r }) => (
                  <tr key={c.chiave} className="border-t border-neutral-100 align-top">
                    <td className="py-1.5"><b>{c.clienteNome}</b> · {c.href ? <Link href={c.href} className="underline">{c.numero}</Link> : c.numero}
                      {r.note.length > 0 && <span className="block text-xs text-amber-800">⏳ {r.note.join(" · ")}</span>}</td>
                    <td className="text-right">{eur(c.provvigione!.importo)}</td>
                    <td className="text-right">{r.accontoOk ? <span className="text-green-800">✓ {eur(r.accontoMaturato)}</span> : <span className="text-neutral-400">{eur(r.quotaAcconto)} no</span>}</td>
                    <td className="text-right">{r.saldoStato === "MATURATO" ? <span className="text-green-800">✓ {eur(r.saldoMaturato)}</span>
                      : r.saldoStato === "DA_VERIFICARE" ? <span className="text-amber-800">{eur(r.quotaSaldo)} da verificare</span> : <span className="text-neutral-400">{eur(r.quotaSaldo)} no</span>}</td>
                    <td className="text-right">{eur(r.giaPagato)}</td>
                    <td className="text-right font-semibold">{eur(r.daPagare)}</td>
                    <td className="text-right print:hidden">
                      {r.daPagare > 0 && (
                        <form action={registraLiquidazione} className="inline-flex items-center gap-1">
                          <input type="hidden" name="provvigioneId" value={c.provvigione!.id} /><input type="hidden" name="importo" value={r.daPagare.toFixed(2)} /><input type="hidden" name="data" value={oggi} />
                          <input type="hidden" name="note" value={`Report di ${nomeMese(mese)}`} /><input type="hidden" name="torna" value={torna} />
                          <button className="btn-3d btn-3d-green px-2 py-1 text-xs">✓ Segna pagata</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
