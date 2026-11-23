// Scadenzario degli incassi della pratica, come in BConsole (Debora 23/11/2026): rata, descrizione, pagamento, scadenza, data pagamento, fattura, importo e stato.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { residuoScadenza } from "@/lib/amministrazione/server";
import RegistraPagamento from "@/components/amministrazione/RegistraPagamento";
import { nomeMetodo } from "@/lib/amministrazione/pagamenti";
import { eur, dataIt } from "@/lib/amministrazione/costanti";

const ORDINE: Record<string, number> = { COMMESSA_ACCONTO: 0, COMMESSA_SALDO: 99 };
const ordineDi = (o: string) => ORDINE[o] ?? (o.startsWith("COMMESSA_RATA_") ? Number(o.replace("COMMESSA_RATA_", "")) || 50 : 60);

export default async function ScadenzarioPratica({ commessaId, ritorno, puoRegistrare, puoAggiungere }: { commessaId: string; ritorno: string; puoRegistrare: boolean; puoAggiungere: boolean }) {
  const idFatture = (await prisma.fatturaVendita.findMany({ where: { commessaId }, select: { id: true } })).map((f) => f.id);
  const [scadenze, conti] = await Promise.all([
    prisma.scadenza.findMany({
      where: { tipo: "INCASSO", stato: { not: "ANNULLATA" }, OR: [{ commessaId }, ...(idFatture.length ? [{ fatturaVenditaId: { in: idFatture } }] : [])] },
      include: { abbinamenti: { select: { id: true, importo: true, movimento: { select: { id: true, data: true, metodo: true, origine: true, confermatoIl: true, daConfermare: true, conto: { select: { nome: true } } } } } } },
    }),
    puoRegistrare ? prisma.contoFinanziario.findMany({ where: { attivo: true }, select: { id: true, nome: true, tipo: true }, orderBy: { ordine: "asc" } }) : Promise.resolve([]),
  ]);
  if (scadenze.length === 0) return null;
  const righe = scadenze.sort((a, b) => ordineDi(a.origine) - ordineDi(b.origine) || (a.dataScadenza?.getTime() ?? 0) - (b.dataScadenza?.getTime() ?? 0));
  const totale = righe.reduce((t, s) => t + s.importo, 0);
  return (
    <details id="scadenzario" className="card-fase scroll-mt-4" style={{ "--fase": "#7c3aed" } as React.CSSProperties}>
      <summary className="cursor-pointer list-none"><h2 className="mb-1">📅 Scadenzario del cliente <span className="text-sm font-normal text-neutral-600">· {righe.length} {righe.length === 1 ? "rata" : "rate"} · totale {eur(totale)}</span></h2></summary>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-white bg-purple-700"><th className="px-2 py-1">N.</th><th className="px-2">Descrizione</th><th className="px-2">Pagamento</th><th className="px-2">Scadenza</th><th className="px-2">Data pagamento</th><th className="px-2">Fattura</th><th className="px-2 text-right">Importo</th><th className="px-2">Stato</th></tr></thead>
          <tbody>
            {righe.map((s, i) => {
              const residuo = residuoScadenza(s);
              const pagata = s.stato === "PAGATA" || residuo <= 0.005;
              const date = s.abbinamenti.map((a) => a.movimento.data).sort((a, b) => b.getTime() - a.getTime());
              const dataPag = s.pagataIl ?? date[0] ?? null;
              return (
                <tr key={s.id} className="border-t border-neutral-200 align-top">
                  <td className="px-2 py-1.5">{i + 1}</td>
                  <td className="px-2">{s.descrizione}</td>
                  <td className="px-2">{s.metodoPagamento ? nomeMetodo(s.metodoPagamento) : s.abbinamenti[0]?.movimento.metodo ? nomeMetodo(s.abbinamenti[0].movimento.metodo) : "—"}</td>
                  <td className="px-2 whitespace-nowrap">{s.dataScadenza ? dataIt(s.dataScadenza) : "—"}</td>
                  <td className="px-2 whitespace-nowrap">{dataPag ? dataIt(dataPag) : "—"}</td>
                  <td className="px-2">{s.numeroDocumento ?? "—"}</td>
                  <td className="px-2 text-right whitespace-nowrap">{eur(s.importo)}</td>
                  <td className="px-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${pagata ? "bg-green-100 text-green-900" : s.stato === "PARZIALE" || residuo < s.importo - 0.005 ? "bg-amber-100 text-amber-900" : "bg-purple-100 text-purple-900"}`}>{pagata ? "Pagata" : residuo < s.importo - 0.005 ? "Parziale" : "Previsionale"}</span>
                    {puoRegistrare && !pagata && (
                      <details className="mt-1"><summary className="cursor-pointer text-xs text-blue-800 underline">Registra pagamento</summary>
                        <RegistraPagamento compatto conti={conti} ritorno={ritorno} scadenza={{ id: s.id, tipo: s.tipo, residuo, ritenuta: s.ritenuta, pagamenti: s.abbinamenti.map((a) => ({ abbinamentoId: a.id, importo: a.importo, movimento: a.movimento })) }} />
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {puoAggiungere && <p className="mt-2 text-xs text-neutral-700">Per aggiungere una rata usa «📆 Rate intermedie» nel passo dell&apos;incasso, oppure <Link href="/amministrazione/scadenzario" className="underline text-blue-800">lo scadenzario completo</Link>.</p>}
    </details>
  );
}
