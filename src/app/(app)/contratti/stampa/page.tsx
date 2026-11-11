export const dynamic = "force-dynamic";

// Stampa delle provvigioni (stessi filtri della pagina Contratti): cliente per cliente maturate, pagate e da pagare.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import PrintButton from "@/components/PrintButton";
import { contrattiDi, personeVisibili, gestisceProvvigioni } from "@/lib/provvigioni/server";
import { filtra, totali, riepilogoProvvigione, riepilogoPagamenti, NOMI_STATO_PROVVIGIONE, NOMI_STATO_PAGAMENTO, cent } from "@/lib/provvigioni/calcoli";

type P = { persona?: string; q?: string; anno?: string; pagamento?: string; provvigione?: string; origine?: string };
const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const giorno = (d: Date | null | undefined) => (d ? d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

export default async function StampaProvvigioni({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const p = await searchParams;
  const persone = await personeVisibili(u);
  const gestore = gestisceProvvigioni(u);
  const persona = p.persona === "tutti" && persone.length > 1 ? "tutti" : persone.find((x) => x.id === p.persona)?.id ?? (gestore && persone.length > 1 ? "tutti" : u.id);
  const scelte = persona === "tutti" ? persone : persone.filter((x) => x.id === persona);
  const contratti = filtra(await contrattiDi(scelte.length ? scelte : [{ id: u.id, nome: u.nome, username: u.username }]),
    { q: p.q?.trim(), anno: p.anno, pagamento: p.pagamento, provvigione: p.provvigione, origine: p.origine });
  const t = totali(contratti);
  const nome = persona === "tutti" ? "tutto il team" : persone.find((x) => x.id === persona)?.nome ?? u.nome;
  const filtri = [p.anno && `anno ${p.anno}`, p.q && `ricerca «${p.q}»`, p.pagamento && NOMI_STATO_PAGAMENTO[p.pagamento as keyof typeof NOMI_STATO_PAGAMENTO],
    p.provvigione && `provvigione ${NOMI_STATO_PROVVIGIONE[p.provvigione as keyof typeof NOMI_STATO_PROVVIGIONE]?.toLowerCase()}`, p.origine].filter(Boolean).join(" · ");

  // cliente per cliente
  const perCliente = new Map<string, { cliente: string; n: number; imponibile: number; provvigione: number; maturata: number; liquidata: number; daLiquidare: number }>();
  for (const c of contratti) {
    const pv = riepilogoProvvigione(c);
    const k = `${c.commercialeNome}|${c.clienteNome.trim().toUpperCase()}`;
    const r = perCliente.get(k) ?? { cliente: c.clienteNome, n: 0, imponibile: 0, provvigione: 0, maturata: 0, liquidata: 0, daLiquidare: 0 };
    r.n++; r.imponibile = cent(r.imponibile + c.imponibile); r.provvigione = cent(r.provvigione + pv.importo);
    r.maturata = cent(r.maturata + pv.maturata); r.liquidata = cent(r.liquidata + pv.liquidata); r.daLiquidare = cent(r.daLiquidare + pv.daLiquidare);
    perCliente.set(k, r);
  }
  const back = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]);

  return (
    <div className="mx-auto max-w-5xl bg-white p-2 text-[12px] text-neutral-900 print:max-w-none print:p-0">
      <div className="mb-3 flex flex-wrap gap-2 pr-48 print:hidden">
        <Link href={`/contratti?${back}`} className="btn-indietro">← Torna ai contratti</Link>
      </div>
      <PrintButton />
      <h1 className="text-xl font-extrabold">Provvigioni — {nome}</h1>
      <p className="text-neutral-600">Stampata il {giorno(new Date())}{filtri ? ` · ${filtri}` : ""} · {t.contratti} contratti</p>

      <table className="mt-3 w-full border-collapse">
        <tbody>
          <tr className="[&>td]:border [&>td]:border-neutral-300 [&>td]:px-2 [&>td]:py-1">
            <td>Venduto (imponibile)<br /><b>{eur(t.venduto)}</b></td>
            <td>Provvigioni<br /><b>{eur(t.provvigioni)}</b></td>
            <td>Maturate<br /><b>{eur(t.maturate)}</b></td>
            <td>Pagate al commerciale<br /><b>{eur(t.liquidate)}</b></td>
            <td>Da pagare (maturate)<br /><b>{eur(t.daLiquidare)}</b></td>
            <td>Ancora da maturare<br /><b>{eur(cent(Math.max(0, t.provvigioni - Math.max(t.maturate, t.liquidate))))}</b></td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-4 text-sm font-bold">Per cliente</h2>
      <table className="mt-1 w-full border-collapse">
        <thead><tr className="bg-neutral-100 text-left [&>th]:border [&>th]:border-neutral-300 [&>th]:px-2 [&>th]:py-1">
          <th>Cliente</th><th className="text-right">Contratti</th><th className="text-right">Imponibile</th><th className="text-right">Provvigione</th><th className="text-right">Maturata</th><th className="text-right">Pagata</th><th className="text-right">Da pagare</th>
        </tr></thead>
        <tbody>
          {[...perCliente.values()].sort((a, b) => a.cliente.localeCompare(b.cliente)).map((r) => (
            <tr key={r.cliente + r.n + r.imponibile} className="break-inside-avoid [&>td]:border [&>td]:border-neutral-300 [&>td]:px-2 [&>td]:py-0.5">
              <td>{r.cliente}</td><td className="text-right">{r.n}</td><td className="text-right">{eur(r.imponibile)}</td><td className="text-right">{r.provvigione ? eur(r.provvigione) : "da controllare"}</td>
              <td className="text-right">{eur(r.maturata)}</td><td className="text-right">{eur(r.liquidata)}</td><td className="text-right font-bold">{eur(r.daLiquidare)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-4 text-sm font-bold">Dettaglio dei contratti</h2>
      <table className="mt-1 w-full border-collapse">
        <thead><tr className="bg-neutral-100 text-left [&>th]:border [&>th]:border-neutral-300 [&>th]:px-2 [&>th]:py-1">
          <th>Data</th><th>Contratto</th><th>Cliente</th>{persona === "tutti" && <th>Commerciale</th>}<th className="text-right">Base</th><th className="text-right">%</th><th className="text-right">Provvigione</th><th>Cliente ha pagato</th><th className="text-right">Maturata</th><th className="text-right">Pagata</th><th className="text-right">Da pagare</th>
        </tr></thead>
        <tbody>
          {contratti.map((c) => {
            const pv = riepilogoProvvigione(c), pg = riepilogoPagamenti(c);
            return (
              <tr key={c.chiave} className="break-inside-avoid [&>td]:border [&>td]:border-neutral-300 [&>td]:px-2 [&>td]:py-0.5">
                <td>{giorno(c.data)}</td><td>{c.numero}</td><td>{c.clienteNome}</td>{persona === "tutti" && <td>{c.commercialeNome}</td>}
                <td className="text-right">{c.provvigione ? eur(c.provvigione.base) : eur(c.imponibile)}</td>
                <td className="text-right">{c.provvigione ? `${c.provvigione.percentuale}%` : "—"}</td>
                <td className="text-right">{c.provvigione ? eur(pv.importo) : NOMI_STATO_PROVVIGIONE.DA_CONTROLLARE}</td>
                <td>{Math.round(pg.quota * 100)}% ({eur(pg.incassato)})</td>
                <td className="text-right">{eur(pv.maturata)}</td><td className="text-right">{eur(pv.liquidata)}</td><td className="text-right font-bold">{eur(pv.daLiquidare)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-neutral-500">La provvigione matura in proporzione a quanto ha pagato il cliente (acconto, saldo…); i servizi e le pratiche a costo netto (ENEA, autoscala, facchinaggio) non entrano nella base.</p>
    </div>
  );
}
