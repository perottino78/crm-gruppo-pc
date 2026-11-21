// Apertura pratica di Giorgia (Fatturazione): 1 creazione del progetto → 2 fattura di acconto → 3 chiamata di benvenuto (Ugo, 21/11/2026: fattura e chiamata dentro il progetto).
// Si vede un solo passo alla volta; ogni passo salvato si può rivedere e modificare dalla barra dei passi.
import Link from "next/link";
import type { ChiavePasso } from "@/lib/pratica/passi";

type Azione = (fd: FormData) => Promise<void>;
export type DatiApertura = {
  commessaId: string; cliente: string; telefono: string | null; importoAcconto: number; legacy: boolean;
  fatturaAccontoIl: Date | null; fatturaAccontoDaNome: string | null; progettoCreatoIl: Date | null; progettoCreatoDaNome: string | null;
  benvenutoIl: Date | null; benvenutoDaNome: string | null; benvenutoNote: string | null;
};

const giorno = (d: Date | null) => (d ? d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "");
const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });

export default function PannelloApertura({ passo, d, registraFattura, creaProgetto, registraBenvenuto, ok, avviso }: {
  passo: Extract<ChiavePasso, "FATTURA" | "PROGETTO" | "BENVENUTO">; d: DatiApertura;
  registraFattura: Azione; creaProgetto: Azione; registraBenvenuto: Azione; ok?: string; avviso?: string;
}) {
  return (
    <section id="progetto" className="card-fase scroll-mt-4 mb-4" style={{ "--fase": "#7c3aed" } as React.CSSProperties}>
      {ok && <p className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {ok}</p>}
      {avviso && <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{avviso}</p>}

      {passo === "FATTURA" && (
        <>
          <h2 className="mb-2">2 · Fattura di acconto</h2>
          <p className="mb-3 text-sm text-neutral-800">Emetti la fattura di acconto di <b>{d.cliente}</b>{d.importoAcconto > 0 ? <> (acconto della pratica {eur(d.importoAcconto)})</> : null}. Poi torna qui e segna che è fatta.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/fatturazione" className="btn-3d btn-3d-outline px-4 py-2 text-sm">🧾 Apri Fatture e DDT</Link>
            {d.fatturaAccontoIl ? (
              <>
                <span className="rounded bg-green-100 px-3 py-1.5 text-sm font-bold text-green-900">✅ Segnata il {giorno(d.fatturaAccontoIl)}{d.fatturaAccontoDaNome ? ` da ${d.fatturaAccontoDaNome}` : ""}</span>
                <form action={registraFattura}><input type="hidden" name="commessaId" value={d.commessaId} /><input type="hidden" name="annulla" value="1" /><button className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">↩ Rimetti da fare</button></form>
              </>
            ) : (
              <form action={registraFattura}><input type="hidden" name="commessaId" value={d.commessaId} /><button className="btn-3d btn-3d-green px-4 py-2 text-sm">✅ Fattura emessa: avanti</button></form>
            )}
          </div>
        </>
      )}

      {passo === "PROGETTO" && (
        <>
          <h2 className="mb-2">1 · Creazione del progetto</h2>
          {d.progettoCreatoIl ? (
            <p className="rounded bg-green-100 px-3 py-2 text-sm font-bold text-green-900">✅ Progetto creato il {giorno(d.progettoCreatoIl)}{d.progettoCreatoDaNome ? ` da ${d.progettoCreatoDaNome}` : ""}.</p>
          ) : (
            <form action={creaProgetto} className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-green-300 bg-green-50 px-4 py-3">
              <input type="hidden" name="commessaId" value={d.commessaId} />
              <p className="min-w-[16rem] flex-1 text-sm text-green-900">Crea il progetto della pratica: dentro si fanno la fattura di acconto e la chiamata di benvenuto, poi si fissa il rilievo, si caricano le misure, si inseriscono i prodotti e si ordina ai fornitori.</p>
              <button className="btn-3d btn-3d-green">➕ Crea progetto</button>
            </form>
          )}
        </>
      )}

      {passo === "BENVENUTO" && (
        <>
          <h2 className="mb-2">3 · Chiamata di benvenuto</h2>
          <p className="mb-3 text-sm text-neutral-800">
            Chiama <b>{d.cliente}</b> per dargli il benvenuto: spiega i passi (rilievo, ordine del materiale, posa) e chi lo chiamerà. Poi annota com&apos;è andata.
            {d.telefono && <> <a href={`tel:${d.telefono}`} className="ml-1 font-bold text-blue-800 underline">📞 {d.telefono}</a></>}
          </p>
          <form action={registraBenvenuto} className="space-y-2">
            <input type="hidden" name="commessaId" value={d.commessaId} />
            <textarea name="note" rows={3} defaultValue={d.benvenutoNote ?? ""} placeholder="Com'è andata la chiamata? es. cliente contento, preferisce essere chiamato dopo le 17" className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm" />
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-3d btn-3d-green px-4 py-2 text-sm">{d.benvenutoIl ? "💾 Aggiorna la nota" : "✅ Salva la chiamata e completa l'apertura"}</button>
              {d.benvenutoIl && <span className="text-xs font-semibold text-green-800">✅ Fatta il {giorno(d.benvenutoIl)}{d.benvenutoDaNome ? ` da ${d.benvenutoDaNome}` : ""}</span>}
            </div>
          </form>
        </>
      )}
    </section>
  );
}
