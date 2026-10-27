export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cent } from "@/lib/amministrazione/estratto";
import { BRANDS } from "@/lib/brands";
import { eur, dataIt } from "@/lib/amministrazione/costanti";
import { salvaConto, annullaImportazione, chiudiMese, riapriMese } from "@/app/amministrazione-actions";
import ImportaEstratto from "@/components/amministrazione/ImportaEstratto";
import ImportaFoglio from "@/components/amministrazione/ImportaFoglio";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white";

export default async function BanchePage() {
  const utente = await getCurrentUser();
  const admin = utente?.ruolo === "AMMINISTRATORE";
  const [conti, importazioni, chiusure, registro] = await Promise.all([
    prisma.contoFinanziario.findMany({ orderBy: [{ attivo: "desc" }, { ordine: "asc" }, { nome: "asc" }] }),
    prisma.importazioneEstratto.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { conto: { select: { nome: true } } } }),
    prisma.chiusuraMese.findMany({ orderBy: [{ anno: "desc" }, { mese: "desc" }] }),
    prisma.registroAmministrazione.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  // importazioni annullabili: nessun movimento ancora lavorato
  const lavorati = await prisma.movimentoFinanziario.groupBy({
    by: ["importazioneId"], where: { importazioneId: { in: importazioni.map((i) => i.id) }, OR: [{ stato: { not: "DA_ABBINARE" } }, { abbinamenti: { some: {} } }] }, _count: true,
  });
  const nonAnnullabili = new Set(lavorati.map((l) => l.importazioneId));

  // ultimi 12 mesi con i movimenti ancora da abbinare
  const oggi = new Date();
  const mesi = await Promise.all(Array.from({ length: 12 }, async (_, i) => {
    const d = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth() - i - 1, 1));
    const anno = d.getUTCFullYear(), mese = d.getUTCMonth() + 1;
    const da = new Date(Date.UTC(anno, mese - 1, 1)), a = new Date(Date.UTC(anno, mese, 1));
    const [aperti, tot] = await Promise.all([
      prisma.movimentoFinanziario.count({ where: { stato: "DA_ABBINARE", data: { gte: da, lt: a } } }),
      prisma.movimentoFinanziario.count({ where: { data: { gte: da, lt: a } } }),
    ]);
    return { anno, mese, aperti, tot, chiusura: chiusure.find((c) => c.anno === anno && c.mese === mese) };
  }));

  return (
    <div className="space-y-6">
      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <h2 className="font-bold text-neutral-900 mb-1">1 · Importa estratto conto</h2>
        <p className="text-xs text-neutral-600 mb-3">Dall&apos;home banking esporta i movimenti in formato CSV e caricali qui. Prima vedi l&apos;anteprima, poi confermi.</p>
        <ImportaEstratto conti={conti.filter((c) => c.attivo && c.tipo !== "CASSA").map((c) => ({ id: c.id, nome: c.nome }))} />
      </section>

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <h2 className="font-bold text-neutral-900 mb-1">1b · Importa la prima nota da foglio (Excel / Google Fogli)</h2>
        <p className="text-xs text-neutral-600 mb-3">Per i movimenti già registrati a mano sul foglio della prima nota: scarica il foglio dell&apos;anno in CSV e caricalo qui. Le righe con il totale diventano movimenti, quelle senza totale vanno nello scadenzario. Puoi ricaricare lo stesso foglio aggiornato: le righe già importate vengono saltate. <b>Per lo stesso conto e periodo usa o il foglio o l&apos;estratto della banca, non entrambi</b>: le descrizioni sono diverse e i movimenti risulterebbero doppi.</p>
        <ImportaFoglio conti={conti.filter((c) => c.attivo && c.tipo !== "CASSA").map((c) => ({ id: c.id, nome: c.nome }))} />
      </section>

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <h2 className="font-bold text-neutral-900 mb-1">2 · Conti</h2>
        <p className="text-xs text-neutral-600 mb-3">Il <b>saldo iniziale</b> è il saldo del conto alla data indicata (es. 30/09 dall&apos;estratto di settembre): i movimenti successivi a quella data si importano e si sommano. Va impostato una volta sola.</p>
        <div className="space-y-2">
          {conti.map((c) => (
            <details key={c.id} className="border border-neutral-200 rounded-lg">
              <summary className="cursor-pointer px-3 py-2 flex flex-wrap justify-between gap-2 text-sm">
                <span><b>{c.nome}</b> <span className="text-neutral-500">· {c.tipo === "CASSA" ? "Cassa" : c.tipo === "CARTA" ? "Carta" : c.banca ?? "Banca"}{c.iban ? ` · ${c.iban}` : ""}{c.divisione ? ` · ${c.divisione}` : ""}{!c.attivo ? " · NON ATTIVO" : ""}</span></span>
                <span className="text-neutral-600">saldo iniziale {eur(c.saldoIniziale)} al {dataIt(c.dataSaldoIniziale)}{c.fido ? ` · fido ${eur(c.fido)}` : ""}</span>
              </summary>
              <FormConto conto={c} />
            </details>
          ))}
          <details className="border border-dashed border-neutral-400 rounded-lg" open={conti.length === 0}>
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">➕ Nuovo conto</summary>
            <FormConto />
          </details>
        </div>
      </section>

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <h2 className="font-bold text-neutral-900 mb-3">3 · Storico importazioni e quadrature</h2>
        {importazioni.length === 0 ? <p className="text-sm text-neutral-500">Nessuna importazione.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-[11px] uppercase text-neutral-500"><tr><th className="text-left py-1">Quando</th><th className="text-left">Conto</th><th className="text-left">File</th><th className="text-left">Periodo</th><th className="text-right">Nuovi / doppioni</th><th className="text-left pl-3">Quadratura</th><th></th></tr></thead>
              <tbody>
                {importazioni.map((i) => {
                  const diff = i.saldoFinaleBanca == null ? null : cent(i.saldoFinaleBanca - (i.saldoCalcolato ?? 0));
                  const annullata = i.nomeFile.startsWith("[ANNULLATA]");
                  return (
                    <tr key={i.id} className={`border-t border-neutral-100 ${annullata ? "text-neutral-400" : ""}`}>
                      <td className="py-1.5">{i.createdAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })}<span className="block text-[10px] text-neutral-500">{i.utenteNome}</span></td>
                      <td>{i.conto.nome}</td>
                      <td className="break-all max-w-[200px]">{i.nomeFile}</td>
                      <td>{dataIt(i.dataDa)} – {dataIt(i.dataA)}</td>
                      <td className="text-right">{i.righeNuove} / {i.doppioni}</td>
                      <td className="pl-3">
                        {diff === null ? <span className="text-neutral-500">non verificata</span>
                          : Math.abs(diff) < 0.005 ? <span className="text-green-700 font-bold">✓ OK</span>
                          : <span className="text-red-600 font-bold">✗ diff. {eur(diff)}</span>}
                      </td>
                      <td className="text-right">
                        {admin && !annullata && i.righeNuove > 0 && !nonAnnullabili.has(i.id) && (
                          <form action={annullaImportazione} className="flex items-center gap-1 justify-end">
                            <input type="hidden" name="id" value={i.id} />
                            <label className="text-[10px] flex items-center gap-1"><input type="checkbox" name="conferma" value="si" required /> sicuro</label>
                            <button className="text-[11px] text-red-600 underline">Annulla</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[11px] text-neutral-500 mt-2">«Annulla» (solo amministratore) serve se un file è stato caricato sul conto sbagliato, ed è possibile solo finché nessun movimento è stato abbinato o classificato.</p>
          </div>
        )}
      </section>

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <h2 className="font-bold text-neutral-900 mb-1">4 · Chiusura dei mesi</h2>
        <p className="text-xs text-neutral-600 mb-3">Un mese chiuso è bloccato: niente nuovi movimenti, abbinamenti o modifiche con date di quel mese. Chiudi un mese quando è tutto abbinato e i conti quadrano.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {mesi.map((m) => (
            <div key={`${m.anno}-${m.mese}`} className={`border rounded-lg px-3 py-2 text-sm ${m.chiusura ? "bg-neutral-50 border-neutral-300" : "border-neutral-200"}`}>
              <div className="flex justify-between items-center">
                <b className="capitalize">{new Date(Date.UTC(m.anno, m.mese - 1, 15)).toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</b>
                {m.chiusura ? <span className="text-xs font-bold text-neutral-700">🔒 chiuso</span> : <span className={`text-xs ${m.aperti ? "text-amber-700" : "text-green-700"}`}>{m.tot} mov. · {m.aperti} da abbinare</span>}
              </div>
              {m.chiusura ? (
                <>
                  <p className="text-[11px] text-neutral-500">da {m.chiusura.chiusoDaNome} il {dataIt(m.chiusura.createdAt)}</p>
                  {admin && (
                    <form action={riapriMese} className="flex gap-1 mt-1">
                      <input type="hidden" name="anno" value={m.anno} /><input type="hidden" name="mese" value={m.mese} />
                      <input name="motivo" required placeholder="Motivo riapertura" className="border border-neutral-300 rounded px-2 py-0.5 text-xs flex-1" />
                      <button className="text-xs text-red-600 underline">Riapri</button>
                    </form>
                  )}
                </>
              ) : (
                <form action={chiudiMese} className="flex items-center gap-2 mt-1">
                  <input type="hidden" name="anno" value={m.anno} /><input type="hidden" name="mese" value={m.mese} />
                  {m.aperti > 0 && <label className="text-[11px] flex items-center gap-1"><input type="checkbox" name="forza" value="si" required /> chiudi comunque</label>}
                  <button className="btn-3d btn-3d-dark text-xs px-2 py-0.5">Chiudi mese</button>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <details>
          <summary className="cursor-pointer font-bold text-neutral-900">Registro delle operazioni (ultime 100)</summary>
          <table className="w-full text-xs mt-3">
            <tbody>
              {registro.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100 align-top">
                  <td className="py-1 pr-3 whitespace-nowrap text-neutral-500">{r.createdAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">{r.utenteNome}</td>
                  <td className="py-1 pr-3 whitespace-nowrap font-semibold">{r.entita} · {r.azione}</td>
                  <td className="py-1 text-neutral-700">{r.dettaglio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
    </div>
  );
}

function FormConto({ conto }: { conto?: { id: string; nome: string; tipo: string; banca: string | null; iban: string | null; saldoIniziale: number; dataSaldoIniziale: Date; fido: number; ordine: number; attivo: boolean; divisione: string | null } }) {
  return (
    <form action={salvaConto} className="grid md:grid-cols-4 gap-2 p-3 border-t border-neutral-100">
      {conto && <input type="hidden" name="id" value={conto.id} />}
      <label className="text-xs font-semibold">Nome *<input name="nome" required defaultValue={conto?.nome} placeholder="es. Intesa Sanpaolo" className={`${inp} w-full`} /></label>
      <label className="text-xs font-semibold">Tipo
        <select name="tipo" defaultValue={conto?.tipo ?? "BANCA"} className={`${inp} w-full`}><option value="BANCA">Conto corrente</option><option value="CASSA">Cassa contanti</option><option value="CARTA">Carta</option></select></label>
      <label className="text-xs font-semibold">Banca<input name="banca" defaultValue={conto?.banca ?? ""} className={`${inp} w-full`} /></label>
      <label className="text-xs font-semibold">IBAN<input name="iban" defaultValue={conto?.iban ?? ""} className={`${inp} w-full`} /></label>
      <label className="text-xs font-semibold">Saldo iniziale € *<input name="saldoIniziale" required defaultValue={conto ? conto.saldoIniziale.toFixed(2).replace(".", ",") : ""} placeholder="es. 12.500,00" className={`${inp} w-full`} /></label>
      <label className="text-xs font-semibold">…alla data (fine giornata) *<input type="date" name="dataSaldoIniziale" required defaultValue={conto?.dataSaldoIniziale.toISOString().slice(0, 10)} className={`${inp} w-full`} /></label>
      <label className="text-xs font-semibold">Fido €<input name="fido" defaultValue={conto ? conto.fido.toFixed(2).replace(".", ",") : "0"} className={`${inp} w-full`} /></label>
      <label className="text-xs font-semibold">Società / divisione
        <select name="divisione" defaultValue={conto?.divisione ?? ""} className={`${inp} w-full`}><option value="">—</option>{BRANDS.map((b) => <option key={b.nome} value={b.nome}>{b.nome}</option>)}</select></label>
      <label className="text-xs font-semibold">Ordine<input name="ordine" type="number" defaultValue={conto?.ordine ?? 0} className={`${inp} w-full`} /></label>
      {conto && <label className="text-xs font-semibold">Stato<select name="attivo" defaultValue={conto.attivo ? "si" : "no"} className={`${inp} w-full`}><option value="si">Attivo</option><option value="no">Non attivo</option></select></label>}
      <div className="md:col-span-3 flex items-end"><button className="btn-3d btn-3d-green text-sm">{conto ? "Salva conto" : "Crea conto"}</button></div>
    </form>
  );
}
