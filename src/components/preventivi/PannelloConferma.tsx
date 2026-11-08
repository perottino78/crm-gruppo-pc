import Link from "next/link";
import BottoneConferma from "@/components/BottoneConferma";
import { confermaOrdinePreventivo, sbloccaPreventivo, salvaVariante } from "@/app/commesse-actions";
import { nomeUfficio } from "@/lib/flusso";

type Props = {
  preventivoId: string;
  stato: string;
  confermatoIl: Date | null;
  confermatoDaNome: string | null;
  nContratto: number;
  nFoto: number;
  commessa: { id: string; numero: string; prossimo: { titolo: string; ufficio: string } | null } | null;
  amministratore: boolean;
  appenaConfermata: boolean;
  varianteSalvata?: boolean;
};

export default function PannelloConferma(p: Props) {
  if (p.confermatoIl) {
    return (
      <section id="conferma" className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-emerald-900">
              🔒 Ordine confermato il {p.confermatoIl.toLocaleDateString("it-IT")} alle{" "}
              {p.confermatoIl.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              {p.confermatoDaNome ? ` da ${p.confermatoDaNome}` : ""} — offerta bloccata
            </p>
            <p className="text-xs text-emerald-800 mt-0.5">
              Righe, prezzi e condizioni non si modificano più. Puoi ancora caricare documenti e foto qui sotto.
              {p.nContratto ? ` Contratto firmato: ${p.nContratto} file.` : " Contratto: firmato su carta."}
              {p.nFoto ? ` Foto: ${p.nFoto}.` : ""}
            </p>
            {p.varianteSalvata && (
              <p className="text-sm text-emerald-900 mt-2 font-semibold">✅ Variante salvata: la commessa {p.commessa?.numero} ha il nuovo totale e il materiale aggiornato.</p>
            )}
            {p.appenaConfermata && p.commessa?.prossimo && (
              <p className="text-sm text-emerald-900 mt-2 font-semibold">
                ✅ Pratica inviata a <strong>{nomeUfficio(p.commessa.prossimo.ufficio)}</strong>: «{p.commessa.prossimo.titolo}»
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {p.commessa && (
              <Link href={`/commesse/${p.commessa.id}`} className="btn-3d btn-3d-blue text-sm px-3 py-1.5">
                Commessa {p.commessa.numero} →
              </Link>
            )}
            {p.amministratore && (
              <form action={sbloccaPreventivo}>
                <input type="hidden" name="preventivoId" value={p.preventivoId} />
                <BottoneConferma
                  messaggio="Sbloccare l'offerta per una variante? Righe e prezzi tornano modificabili; la commessa resta aperta."
                  className="btn-3d btn-3d-outline text-xs px-3 py-1.5"
                >
                  🔓 Sblocca per variante
                </BottoneConferma>
              </form>
            )}
          </div>
        </div>
      </section>
    );
  }
  if (p.stato === "ANNULLATO") return null;

  // offerta sbloccata per una variante: la commessa c'è già, si salva la variante (niente nuova conferma né task)
  if (p.commessa) {
    return (
      <section id="conferma" className="mb-5 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-amber-900">🔓 Offerta sbloccata per una variante — commessa {p.commessa.numero}</p>
            <p className="text-xs text-amber-900 mt-0.5">Le righe si salvano man mano che le aggiungi o modifichi. Quando hai finito premi «Salva la variante»:
              la commessa prende il nuovo totale e il materiale aggiornato da ordinare, e l&apos;offerta torna bloccata.</p>
          </div>
          {p.amministratore ? (
            <form action={salvaVariante}>
              <input type="hidden" name="preventivoId" value={p.preventivoId} />
              <BottoneConferma messaggio="Salvare la variante? La commessa prende il nuovo totale e il materiale aggiornato, l'offerta torna bloccata." className="btn-3d btn-3d-orange text-sm px-4 py-2">
                💾 Salva la variante e aggiorna la commessa
              </BottoneConferma>
            </form>
          ) : <p className="text-xs text-amber-900">Solo l&apos;amministratore salva la variante.</p>}
        </div>
      </section>
    );
  }

  const ok = p.nContratto > 0;
  return (
    <section id="conferma" className="mb-5 rounded-xl border-2 border-green-600 bg-white shadow-sm overflow-hidden">
      <div className="bg-green-600 text-white px-4 py-2 text-sm font-extrabold">✍️ Il cliente ha firmato? Conferma l’ordine e passa la pratica alla contabilità</div>
      <form action={confermaOrdinePreventivo} className="p-4 grid md:grid-cols-[1fr_1.2fr] gap-4">
        <input type="hidden" name="preventivoId" value={p.preventivoId} />
        <div className="space-y-2 text-sm">
          <p className="font-bold text-neutral-800">Prima di confermare</p>
          <p className={ok ? "text-emerald-700" : "text-red-700"}>
            {ok ? "✓" : "✗"} Contratto firmato {ok ? `caricato (${p.nContratto} file)` : "non ancora caricato"}
          </p>
          <p className={p.nFoto ? "text-emerald-700" : "text-neutral-500"}>
            {p.nFoto ? "✓" : "○"} Foto del lavoro {p.nFoto ? `(${p.nFoto})` : "(facoltative)"}
          </p>
          <a href="#documenti-offerta" className="inline-block text-xs text-blue-700 underline">
            ↓ Carica contratto e foto nelle cartelle «Contratto firmato» e «Foto»
          </a>
          {!ok && (
            <label className="flex items-start gap-2 text-xs text-neutral-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              <input type="checkbox" name="contrattoCartaceo" className="mt-0.5" />
              Firmato su carta: lo consegno in ufficio (la contabilità lo vedrà segnalato nel task)
            </label>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-neutral-700">Nota per la contabilità (acconto, pagamento, finanziamento, urgenze…)</label>
          <textarea
            name="nota"
            rows={3}
            placeholder="es. acconto 50% con bonifico entro venerdì; cliente chiede fattura intestata alla moglie"
            className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm"
          />
          <BottoneConferma
            messaggio="Confermare l'ordine? L'offerta verrà bloccata così com'è, si apre la commessa e la contabilità riceve il task."
            className="btn-3d btn-3d-green text-sm px-4 py-2 self-start"
          >
            🔒 Conferma ordine e invia alla contabilità
          </BottoneConferma>
          <p className="text-[11px] text-neutral-500">
            Cosa succede: offerta → ACCETTATA e bloccata · si apre la commessa · la fase Accettazione si chiude · parte il task per l’ufficio successivo del flusso (Impostazioni › Flusso).
          </p>
        </div>
      </form>
    </section>
  );
}
