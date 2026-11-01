// Modulo "Registra pagamento / incasso" di una scadenza (come in BConsole): data, importo totale o parziale, banca,
// metodo, commissione bancaria, ritenuta 11% sui bonifici per detrazione. Sotto, i pagamenti già registrati.
import { registraPagamento, annullaPagamento } from "@/app/pagamenti-actions";
import { METODI_PAGAMENTO, nomeMetodo } from "@/lib/amministrazione/pagamenti";
import { eur, dataIt } from "@/lib/amministrazione/costanti";
import { chiaveGiorno } from "@/lib/calendario/tempo";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white w-full";
const virgola = (n: number) => n.toFixed(2).replace(".", ",");

export type ContoPerPagamento = { id: string; nome: string; tipo: string };
export type PagamentoFatto = { abbinamentoId: string; importo: number; movimento: { id: string; data: Date; metodo: string | null; origine: string; confermatoIl: Date | null; daConfermare: boolean; conto: { nome: string } } };

export default function RegistraPagamento({ scadenza, conti, ritorno, ritenutaSuggerita = 0, metodoSuggerito, compatto }: {
  scadenza: { id: string; tipo: string; residuo: number; ritenuta?: number; pagamenti?: PagamentoFatto[] };
  conti: ContoPerPagamento[];
  ritorno: string;
  ritenutaSuggerita?: number;
  metodoSuggerito?: string | null;
  compatto?: boolean;
}) {
  const incasso = scadenza.tipo === "INCASSO";
  const rit = Math.min(ritenutaSuggerita, scadenza.residuo);
  const metodi = METODI_PAGAMENTO.filter((m) => incasso || !("soloIncassi" in m));
  const oggi = chiaveGiorno(new Date());
  return (
    <div className="space-y-2">
      {scadenza.pagamenti && scadenza.pagamenti.length > 0 && (
        <ul className="text-[11px] space-y-0.5">
          {scadenza.pagamenti.map((p) => (
            <li key={p.abbinamentoId} className="flex flex-wrap items-center gap-1 text-green-800">
              ✓ {dataIt(p.movimento.data)} · {eur(p.importo)} · {p.movimento.conto.nome}{p.movimento.metodo ? ` · ${nomeMetodo(p.movimento.metodo)}` : ""}
              {p.movimento.daConfermare && !p.movimento.confermatoIl && <span className="text-amber-700">(da confermare con l&apos;estratto)</span>}
              {p.movimento.confermatoIl && <span className="text-neutral-500">(confermato dall&apos;estratto)</span>}
              {p.movimento.origine === "MANUALE" && p.movimento.metodo && !p.movimento.confermatoIl && (
                <form action={annullaPagamento} className="inline">
                  <input type="hidden" name="movimentoId" value={p.movimento.id} />
                  <input type="hidden" name="ritorno" value={ritorno} />
                  <button className="text-red-700 underline ml-1">annulla</button>
                </form>
              )}
            </li>
          ))}
          {!!scadenza.ritenuta && <li className="text-green-800">✓ ritenuta 11% trattenuta dalla banca: {eur(scadenza.ritenuta)}</li>}
        </ul>
      )}
      {scadenza.residuo > 0.004 && (
        <form action={registraPagamento} className={`grid ${compatto ? "grid-cols-2" : "sm:grid-cols-4"} gap-1.5 items-end`}>
          <input type="hidden" name="scadenzaId" value={scadenza.id} />
          <input type="hidden" name="ritorno" value={ritorno} />
          <p className={`${compatto ? "col-span-2" : "sm:col-span-4"} text-[11px] font-semibold`}>{incasso ? "Registra incasso" : "Registra pagamento"} · da saldare {eur(scadenza.residuo)}</p>
          <label className="text-[11px] text-neutral-600">Data<input type="date" name="data" defaultValue={oggi} className={inp} /></label>
          <label className="text-[11px] text-neutral-600">Importo €{rit ? " accreditato" : ""}<input name="importo" inputMode="decimal" defaultValue={virgola(scadenza.residuo - rit)} className={inp} /></label>
          <label className="text-[11px] text-neutral-600">Banca / cassa
            <select name="contoId" className={inp} defaultValue={conti[0]?.id}>{conti.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          </label>
          <label className="text-[11px] text-neutral-600">Come
            <select name="metodo" className={inp} defaultValue={metodoSuggerito ?? (rit ? "BONIFICO_DETRAZIONE" : "BONIFICO")}>{metodi.map((m) => <option key={m.chiave} value={m.chiave}>{m.nome}</option>)}</select>
          </label>
          <label className="text-[11px] text-neutral-600">Commissione €<input name="commissione" inputMode="decimal" placeholder="0,00" className={inp} /></label>
          {incasso && <label className="text-[11px] text-neutral-600">Ritenuta 11% €<input name="ritenuta" inputMode="decimal" defaultValue={rit ? virgola(rit) : ""} placeholder="solo bonifici per detrazione" className={inp} /></label>}
          <label className={`text-[11px] text-neutral-600 ${compatto ? "col-span-2" : ""}`}>Note<input name="note" placeholder="es. acconto, n. assegno" className={inp} /></label>
          <button className={`btn-3d ${incasso ? "btn-3d-green" : "btn-3d-orange"} text-xs py-2 ${compatto ? "col-span-2" : ""}`}>{incasso ? "Registra incasso" : "Registra pagamento"}</button>
          {incasso && rit > 0 && <p className={`${compatto ? "col-span-2" : "sm:col-span-4"} text-[10px] text-neutral-500`}>Lavoro con detrazione: la banca accredita il totale meno l&apos;11% dell&apos;imponibile ({eur(rit)}), che resta come credito d&apos;imposta.</p>}
          {!conti.length && <p className="text-[11px] text-red-700 col-span-2">Nessuna banca: aggiungila in Amministrazione › Banche.</p>}
        </form>
      )}
    </div>
  );
}
