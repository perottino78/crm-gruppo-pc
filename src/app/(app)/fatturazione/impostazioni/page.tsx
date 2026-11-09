export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getConfig } from "@/lib/leadIngest";
import { CEDENTE, SEZIONALI } from "@/lib/fatturazione/tabelle";
import { progressivoDa } from "@/lib/fatturazione/calcoli";
import { chiaveUltimaFattura, chiaveUltimoDdt, emissioneReale } from "@/lib/fatturazione/server";
import { salvaImpostazioniFatturazione } from "@/app/fatturazione-actions";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm w-28";

/** Numerazione (si riparte dall'ultimo numero di BConsole) e accensione dell'emissione vera. */
export default async function ImpostazioniFatturazionePage({ searchParams }: { searchParams: Promise<{ salvato?: string }> }) {
  const { salvato } = await searchParams;
  const u = await getCurrentUser();
  const anno = new Date().getFullYear();
  const [reale, importate] = await Promise.all([
    emissioneReale(),
    prisma.fatturaVendita.findMany({ where: { data: { gte: new Date(`${anno}-01-01T00:00:00Z`) } }, select: { numero: true } }),
  ]);
  const sez = await Promise.all(SEZIONALI.map(async (s) => {
    const daBc = Math.max(0, ...importate.map((f) => progressivoDa(f.numero, s.codice, anno) ?? 0));
    return { ...s, indicato: Number(await getConfig(chiaveUltimaFattura(s.codice, anno))) || null, daBc };
  }));
  const ultimoDdt = Number(await getConfig(chiaveUltimoDdt(anno))) || null;
  return (
    <div className="space-y-4 max-w-3xl">
      {salvato && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✓ Salvato</p>}
      <form action={salvaImpostazioniFatturazione} className="card-fase space-y-4">
        <input type="hidden" name="anno" value={anno} />
        <div>
          <h2 className="font-bold text-neutral-900">Numerazione {anno}: si continua da BConsole</h2>
          <p className="text-sm text-neutral-700">Il CRM dà il numero successivo al più alto fra: le fatture di BConsole già caricate qui, quelle emesse dal CRM e l&apos;ultimo numero che scrivi qui sotto. Il giorno del passaggio scrivi l&apos;ultimo numero usato in BConsole per ogni sezionale.</p>
        </div>
        <table className="text-sm w-full">
          <thead><tr className="text-left text-xs text-neutral-600 border-b"><th className="py-1">Sezionale</th><th>Numero</th><th>Ultimo caricato da BConsole</th><th>Ultimo usato in BConsole</th></tr></thead>
          <tbody>
            {sez.map((s) => (
              <tr key={s.codice} className="border-b border-neutral-100">
                <td className="py-1.5">{s.nome}</td>
                <td className="text-xs text-neutral-600">N/{s.estensione}/{anno}</td>
                <td className="text-xs">{s.daBc ? `${s.daBc}/${s.estensione}/${anno}` : "—"}</td>
                <td><input name={`ultimo_${s.codice}`} type="number" min={0} defaultValue={s.indicato ?? ""} placeholder={s.daBc ? String(s.daBc) : "0"} className={inp} /></td>
              </tr>
            ))}
            <tr><td className="py-1.5">DDT di uscita</td><td className="text-xs text-neutral-600">N/{anno}</td><td className="text-xs">—</td><td><input name="ultimo_ddt" type="number" min={0} defaultValue={ultimoDdt ?? ""} placeholder="es. 551" className={inp} /></td></tr>
          </tbody>
        </table>
        <div className={`rounded-lg border-2 p-3 ${reale ? "border-green-400 bg-green-50" : "border-violet-300 bg-violet-50"}`}>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="reale" defaultChecked={reale} disabled={u?.ruolo !== "AMMINISTRATORE"} className="mt-1" />
            <span>
              <b>Emissione vera</b> di fatture e DDT (numeri validi, fatture nelle vendite e nello scadenzario).<br />
              <span className="text-neutral-700">Spenta = modalità <b>PROVA</b>: fatture e DDT prendono numeri «PROVA …», non vanno nelle vendite, si possono eliminare. Usala per collaudare finché BConsole fattura davvero, per non avere numeri doppi.</span>
              {u?.ruolo !== "AMMINISTRATORE" && <span className="block text-xs text-neutral-600 mt-1">La accende o spegne solo l&apos;amministratore.</span>}
            </span>
          </label>
        </div>
        <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Salva</button>
      </form>
      <div className="card-fase text-sm text-neutral-700 space-y-1">
        <h3 className="font-bold text-neutral-900">Dati dell&apos;azienda in fattura</h3>
        <p>{CEDENTE.denominazione} — {CEDENTE.indirizzo} {CEDENTE.numeroCivico}, {CEDENTE.cap} {CEDENTE.comune} ({CEDENTE.provincia}) — P.IVA e C.F. {CEDENTE.partitaIva} — regime ordinario (RF01).</p>
        <p>Codice destinatario per ricevere le fatture: {CEDENTE.codiceDestinatario} — PEC {CEDENTE.pec}.</p>
        <p className="text-xs text-neutral-600">Presi da BConsole (Profilo azienda). Sezionali, tipi di fattura, codici IVA, causali di trasporto e metodi di pagamento sono gli stessi di BConsole.</p>
      </div>
    </div>
  );
}
