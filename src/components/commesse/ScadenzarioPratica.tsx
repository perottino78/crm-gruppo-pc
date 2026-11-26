// Scadenzario degli incassi della pratica, come in BConsole (Debora 23/11/2026 e 26/11/2026: «non lo trovo da nessuna parte»):
// sempre visibile in alto, aperto se c'è qualcosa da incassare. Colonne: N. rata, descrizione, pagamento, data prevista,
// scadenza effettiva, data pagamento, fattura, importo, stato; totale in fondo, «Registra pagamento» per riga,
// «Aggiungi scadenza» (rata intermedia) e «Ricalcola».
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { residuoScadenza } from "@/lib/amministrazione/server";
import RegistraPagamento from "@/components/amministrazione/RegistraPagamento";
import { nomeMetodo } from "@/lib/amministrazione/pagamenti";
import { eur, dataIt } from "@/lib/amministrazione/costanti";
import { aggiungiRataIntermedia, togliRataIntermedia, ricalcolaScadenzarioPratica } from "@/app/commesse-actions";
import { statoRiga } from "@/lib/pratica/scadenzario";

const ORDINE: Record<string, number> = { COMMESSA_ACCONTO: 0, COMMESSA_SALDO: 99 };
const ordineDi = (o: string) => ORDINE[o] ?? (o.startsWith("COMMESSA_RATA_") ? Number(o.replace("COMMESSA_RATA_", "")) || 50 : 60);
const inp = "border border-neutral-300 rounded px-2 py-1 text-sm bg-white";

export default async function ScadenzarioPratica({ commessaId, ritorno, puoRegistrare, puoAggiungere }: { commessaId: string; ritorno: string; puoRegistrare: boolean; puoAggiungere: boolean }) {
  const idFatture = (await prisma.fatturaVendita.findMany({ where: { commessaId }, select: { id: true } })).map((f) => f.id);
  const [scadenze, conti] = await Promise.all([
    prisma.scadenza.findMany({
      where: { tipo: "INCASSO", stato: { notIn: ["ANNULLATA", "SOSTITUITA"] }, OR: [{ commessaId }, ...(idFatture.length ? [{ fatturaVenditaId: { in: idFatture } }] : [])] },
      include: { abbinamenti: { select: { id: true, importo: true, movimento: { select: { id: true, data: true, metodo: true, origine: true, confermatoIl: true, daConfermare: true, conto: { select: { nome: true } } } } } } },
    }),
    puoRegistrare ? prisma.contoFinanziario.findMany({ where: { attivo: true }, select: { id: true, nome: true, tipo: true }, orderBy: { ordine: "asc" } }) : Promise.resolve([]),
  ]);
  const righe = scadenze.sort((a, b) => ordineDi(a.origine) - ordineDi(b.origine) || (a.dataScadenza?.getTime() ?? 0) - (b.dataScadenza?.getTime() ?? 0));
  const adesso = new Date();
  const calcolate = righe.map((s) => ({ s, residuo: Math.max(0, residuoScadenza(s)) }));
  const totale = righe.reduce((t, s) => t + s.importo, 0);
  const daIncassare = calcolate.reduce((t, r) => t + r.residuo, 0);
  const incassato = Math.max(0, totale - daIncassare);
  const nonPagate = calcolate.filter((r) => r.s.stato !== "PAGATA" && r.residuo > 0.005).length;
  return (
    <details id="scadenzario" className="card-fase scroll-mt-4" style={{ "--fase": "#7c3aed" } as React.CSSProperties} open={nonPagate > 0 || righe.length === 0}>
      <summary className="cursor-pointer list-none">
        <h2 className="mb-1">
          📅 Scadenzario del cliente{" "}
          <span className="text-sm font-normal text-neutral-600">
            {righe.length === 0 ? "· nessuna scadenza ancora" : <>· {righe.length} {righe.length === 1 ? "rata" : "rate"} · {daIncassare > 0.005 ? <b className="text-purple-900">da incassare {eur(daIncassare)}</b> : <b className="text-green-800">tutto incassato</b>} · totale {eur(totale)}</>}
          </span>
        </h2>
      </summary>
      {righe.length === 0 ? (
        <p className="mb-2 text-sm text-neutral-700">Le rate di acconto e saldo compaiono qui dopo la conferma dell&apos;ordine. Se mancano, premi «Ricalcola».</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-white bg-purple-700"><th className="px-2 py-1">N. rata</th><th className="px-2">Descrizione</th><th className="px-2">Pagamento</th><th className="px-2">Data prevista</th><th className="px-2">Scadenza effettiva</th><th className="px-2">Data pagamento</th><th className="px-2">Fattura</th><th className="px-2 text-right">Importo</th><th className="px-2">Stato</th></tr></thead>
            <tbody>
              {calcolate.map(({ s, residuo }, i) => {
                const pagata = s.stato === "PAGATA" || residuo <= 0.005;
                const date = s.abbinamenti.map((a) => a.movimento.data).sort((a, b) => b.getTime() - a.getTime());
                const dataPag = s.pagataIl ?? date[0] ?? null;
                const st = statoRiga({ pagata, parziale: residuo < s.importo - 0.005, etichetta: s.statoEtichetta, haFattura: !!(s.fatturaVenditaId || s.numeroDocumento), scadenza: s.dataScadenza, adesso });
                const togliBile = puoAggiungere && s.origine.startsWith("COMMESSA_RATA_") && !s.abbinamenti.length && s.pagatoManuale <= 0 && s.ritenuta <= 0;
                return (
                  <tr key={s.id} className="border-t border-neutral-200 align-top">
                    <td className="px-2 py-1.5">{i + 1}</td>
                    <td className="px-2">{s.descrizione}</td>
                    <td className="px-2">{s.metodoPagamento ? nomeMetodo(s.metodoPagamento) : s.abbinamenti[0]?.movimento.metodo ? nomeMetodo(s.abbinamenti[0].movimento.metodo) : "—"}</td>
                    <td className="px-2 whitespace-nowrap">{s.dataScadenza ? dataIt(s.dataScadenza) : "—"}</td>
                    <td className="px-2 whitespace-nowrap" title="Compare quando la data è stata cambiata a mano">{s.dataModificata && s.dataScadenza ? dataIt(s.dataScadenza) : "—"}</td>
                    <td className="px-2 whitespace-nowrap">{dataPag ? dataIt(dataPag) : "—"}</td>
                    <td className="px-2 whitespace-nowrap">{s.fatturaVenditaId ? <Link href={`/amministrazione/fatture-vendita/${s.fatturaVenditaId}`} className="text-blue-800 underline">{s.numeroDocumento ?? "apri"}</Link> : s.numeroDocumento ?? "—"}</td>
                    <td className="px-2 text-right whitespace-nowrap">{eur(s.importo)}</td>
                    <td className="px-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${st.classe}`}>{st.testo}</span>
                      {st.scaduta && <span className="ml-1 text-xs font-bold text-red-700">⚠ scaduta</span>}
                      {puoRegistrare && !pagata && (
                        <details className="mt-1"><summary className="cursor-pointer text-xs text-blue-800 underline">Registra pagamento</summary>
                          <RegistraPagamento compatto conti={conti} ritorno={ritorno} scadenza={{ id: s.id, tipo: s.tipo, residuo, ritenuta: s.ritenuta, pagamenti: s.abbinamenti.map((a) => ({ abbinamentoId: a.id, importo: a.importo, movimento: a.movimento })) }} />
                        </details>
                      )}
                      {togliBile && <form action={togliRataIntermedia} className="mt-1"><input type="hidden" name="id" value={s.id} /><button className="text-xs text-red-700 underline">togli la rata</button></form>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-purple-700 bg-purple-50 font-bold">
                <td className="px-2 py-1.5" colSpan={7}>Totale · incassato {eur(incassato)} · da incassare {eur(daIncassare)}</td>
                <td className="px-2 text-right whitespace-nowrap">{eur(totale)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {puoAggiungere && (
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <details className="rounded border border-neutral-200 bg-white px-3 py-2">
            <summary className="cursor-pointer text-sm font-bold text-blue-900">➕ Aggiungi scadenza (rata intermedia)</summary>
            <form action={aggiungiRataIntermedia} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="commessaId" value={commessaId} />
              <div className="flex flex-col gap-1"><label className="text-[11px] font-bold text-neutral-800">Importo €</label><input name="importo" inputMode="decimal" required className={`${inp} w-28`} /></div>
              <div className="flex flex-col gap-1"><label className="text-[11px] font-bold text-neutral-800">Entro il</label><input type="date" name="data" className={inp} /></div>
              <div className="flex flex-col gap-1 flex-1 min-w-40"><label className="text-[11px] font-bold text-neutral-800">Descrizione (facoltativa)</label><input name="descrizione" placeholder="es. Seconda rata alla firma del rilievo" className={`${inp} w-full`} /></div>
              <button className="btn-3d btn-3d-blue text-sm px-3 py-1.5">➕ Aggiungi</button>
            </form>
            <p className="mt-1 text-xs text-neutral-600">Il saldo cala dell&apos;importo della rata.</p>
          </details>
          <form action={ricalcolaScadenzarioPratica}>
            <input type="hidden" name="commessaId" value={commessaId} />
            <button className="btn-3d btn-3d-outline text-sm px-3 py-2" title="Rifà acconto, rate e saldo dai dati della pratica e riallinea lo stato">🔄 Ricalcola</button>
          </form>
          <Link href="/amministrazione/scadenzario" className="self-center text-xs underline text-blue-800">lo scadenzario completo</Link>
        </div>
      )}
    </details>
  );
}
