export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { residuoScadenza, residuoMovimento, mesiChiusi, meseDi, sincronizzaScadenzeCommesse } from "@/lib/amministrazione/server";
import { whereMovimenti, type ParametriMovimenti } from "@/lib/amministrazione/filtri";
import { suggerisci } from "@/lib/amministrazione/abbinamento";
import { cent } from "@/lib/amministrazione/estratto";
import { eur, dataIt, STATI_MOVIMENTO, CATEGORIE_MOVIMENTO } from "@/lib/amministrazione/costanti";
import { BRANDS } from "@/lib/brands";
import { METODI_PAGAMENTO } from "@/lib/amministrazione/pagamenti";
import VisteSalvate from "@/components/amministrazione/VisteSalvate";
import MovimentoAMano from "@/components/amministrazione/MovimentoAMano";
import {
  abbinaMovimento, abbinaSicuri, scollegaAbbinamento, registraMovimento, annullaRegistrazione, nuovoMovimento, stornaMovimento, impostaDivisione,
  collegaFatturaAMovimento, eliminaMovimentoManuale, modificaMovimentoManuale,
} from "@/app/amministrazione-actions";

const inp = "border border-neutral-300 rounded px-2 py-1 text-xs bg-white";

export default async function PrimaNotaPage({ searchParams }: { searchParams: Promise<ParametriMovimenti & { limite?: string }> }) {
  const p = await searchParams;
  await sincronizzaScadenzeCommesse();
  const limite = Math.min(2000, Math.max(100, Number(p.limite) || 200));
  const where = whereMovimenti(p);
  const [conti, movimenti, totali, scadenzeAperte, chiusi, fattureDaCollegare] = await Promise.all([
    prisma.contoFinanziario.findMany({ orderBy: [{ attivo: "desc" }, { ordine: "asc" }, { nome: "asc" }] }),
    prisma.movimentoFinanziario.findMany({
      where, orderBy: [{ data: "desc" }, { createdAt: "desc" }], take: limite,
      include: { conto: { select: { nome: true } }, abbinamenti: { include: { scadenza: true } } },
    }),
    prisma.movimentoFinanziario.groupBy({ by: ["stato"], where, _sum: { importo: true }, _count: true }),
    prisma.scadenza.findMany({ where: { stato: { in: ["APERTA", "PARZIALE"] } }, include: { abbinamenti: true } }),
    mesiChiusi(),
    // fatture d'acquisto arrivate ma non ancora registrate: si possono collegare a un pagamento già scritto a mano
    prisma.fatturaAcquisto.findMany({ where: { stato: "DA_VERIFICARE" }, select: { id: true, fornitoreNome: true, numero: true, numeroFornitore: true, tipoDocumento: true, data: true, totale: true }, orderBy: { data: "desc" }, take: 300 }),
  ]);
  const totEntrate = cent((await prisma.movimentoFinanziario.aggregate({ where: { AND: [where, { importo: { gt: 0 } }] }, _sum: { importo: true } }))._sum.importo ?? 0);
  const totUscite = cent((await prisma.movimentoFinanziario.aggregate({ where: { AND: [where, { importo: { lt: 0 } }] }, _sum: { importo: true } }))._sum.importo ?? 0);
  const commissioniDi = new Map((await prisma.movimentoFinanziario.findMany({ where: { commissioneDiId: { in: movimenti.map((x) => x.id) } }, select: { commissioneDiId: true, importo: true } })).map((c) => [c.commissioneDiId!, c.importo]));
  const conteggio = totali.reduce((t, g) => t + g._count, 0);
  const daAbbinare = totali.find((g) => g.stato === "DA_ABBINARE")?._count ?? 0;

  const saldi = await Promise.all(conti.map(async (c) => {
    const s = await prisma.movimentoFinanziario.aggregate({ where: { contoId: c.id, data: { gt: c.dataSaldoIniziale } }, _sum: { importo: true } });
    return { c, saldo: cent(c.saldoIniziale + (s._sum.importo ?? 0)) };
  }));
  const candidati = scadenzeAperte.map((s) => ({ ...s, residuo: residuoScadenza(s) }));
  const qs = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    Object.entries({ conto: p.conto, mese: p.mese, stato: p.stato, verso: p.verso, q: p.q, ...extra }).forEach(([k, v]) => v && u.set(k, v));
    return `?${u.toString()}`;
  };
  const pill = (a: boolean) => `px-3 py-1 rounded-full text-xs font-semibold border ${a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50"}`;

  return (
    <div className="flex flex-col md:flex-row gap-5 md:items-start">
      <aside className="w-full md:w-56 shrink-0 space-y-2 md:sticky md:top-4 grid grid-cols-2 gap-2 md:block">
        <Link href={qs({ conto: undefined })} className={`block rounded-lg border px-3 py-2 ${!p.conto ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white"}`}>
          <p className="text-xs font-semibold">Tutti i conti</p>
          <p className="font-extrabold">{eur(cent(saldi.filter((s) => s.c.attivo).reduce((t, s) => t + s.saldo, 0)))}</p>
        </Link>
        {saldi.map(({ c, saldo }) => (
          <Link key={c.id} href={qs({ conto: c.id })} className={`block rounded-lg border px-3 py-2 ${p.conto === c.id ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200"} ${c.attivo ? "bg-white" : "bg-neutral-50 opacity-60"}`}>
            <p className="text-xs font-semibold text-neutral-800">{c.nome}</p>
            <p className={`font-bold text-sm ${saldo < 0 ? "text-red-600" : "text-neutral-900"}`}>{eur(saldo)}</p>
            {c.fido > 0 && <p className="text-[10px] text-neutral-500">con fido {eur(saldo + c.fido)}</p>}
          </Link>
        ))}
        {conti.length === 0 && <p className="text-xs text-neutral-500">Crea i conti in «Banche e importazioni».</p>}
      </aside>

      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {[["", "Tutti"], ["DA_ABBINARE", `Da abbinare${daAbbinare && !p.stato ? ` (${daAbbinare})` : ""}`], ["ABBINATO", "Abbinati"], ["REGISTRATO", "Registrati"]].map(([v, l]) => (
            <Link key={v} href={qs({ stato: v || undefined })} className={pill((p.stato ?? "") === v)}>{l}</Link>
          ))}
          <span className="w-px h-5 bg-neutral-300 mx-1" />
          {[["", "Entrate e uscite"], ["entrate", "Entrate"], ["uscite", "Uscite"]].map(([v, l]) => (
            <Link key={v} href={qs({ verso: v || undefined })} className={pill((p.verso ?? "") === v)}>{l}</Link>
          ))}
          <form className="ml-auto flex gap-2 items-center">
            {p.conto && <input type="hidden" name="conto" value={p.conto} />}
            {p.stato && <input type="hidden" name="stato" value={p.stato} />}
            {p.verso && <input type="hidden" name="verso" value={p.verso} />}
            <input type="month" name="mese" defaultValue={p.mese} className={`${inp} py-1.5`} />
            <input name="q" defaultValue={p.q} placeholder="Cerca causale o importo" className={`${inp} py-1.5 w-40 sm:w-52`} />
            <button className="btn-3d btn-3d-dark text-xs px-3">Filtra</button>
          </form>
        </div>

        <VisteSalvate pagina="/amministrazione/prima-nota" query={qs({})} />
        <details className="bg-white border border-neutral-200 rounded-lg px-3 py-2 text-xs text-neutral-700">
          <summary className="cursor-pointer font-semibold">ℹ️ Cosa vogliono dire i bollini?</summary>
          <ul className="mt-2 space-y-1.5">
            {Object.entries(STATI_MOVIMENTO).map(([k, st]) => (
              <li key={k} className="flex gap-2 items-start"><span className={`shrink-0 inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${st.cls}`}>{st.label}</span><span>{st.spiega}</span></li>
            ))}
            <li className="flex gap-2 items-start"><span className="shrink-0 text-[10px] text-purple-700 font-semibold">a mano / storno</span><span>scritto in prima nota da una persona (non arriva dall&apos;estratto conto della banca); lo storno annulla un movimento a mano.</span></li>
            <li className="flex gap-2 items-start"><span className="shrink-0 text-[10px] text-neutral-500">🔒 mese chiuso</span><span>il mese è chiuso: il movimento non si cambia più.</span></li>
          </ul>
        </details>
        <div className="flex flex-wrap gap-3 items-center bg-white border border-neutral-200 rounded-lg px-4 py-2 text-sm">
          <span>{conteggio} movimenti</span>
          <span className="text-green-700 font-semibold">Entrate {eur(totEntrate)}</span>
          <span className="text-orange-700 font-semibold">Uscite {eur(Math.abs(totUscite))}</span>
          <span className="font-bold">Netto {eur(cent(totEntrate + totUscite))}</span>
          <div className="ml-auto flex gap-2">
            <form action={abbinaSicuri}><button className="btn-3d btn-3d-green text-xs px-3" title="Abbina solo quando importo e nome (o n° fattura) coincidono senza ambiguità">⚡ Abbina i sicuri</button></form>
            <a href={`/api/amministrazione/export${qs({ vista: "movimenti" })}`} className="btn-3d btn-3d-outline text-xs px-3">⬇ Excel</a>
          </div>
        </div>

        <details className="bg-white border border-neutral-200 rounded-lg p-3">
          <summary className="cursor-pointer font-semibold text-sm">➕ Movimento a mano (cassa contanti, pagamento a un fornitore, rettifica)</summary>
          <MovimentoAMano
            azione={nuovoMovimento}
            conti={conti.filter((c) => c.attivo).map((c) => ({ id: c.id, nome: c.nome }))}
            contoPredefinito={p.conto ?? conti.find((c) => c.tipo === "CASSA")?.id}
            categorie={[...CATEGORIE_MOVIMENTO]}
            divisioni={BRANDS.map((b) => b.nome)}
            metodi={METODI_PAGAMENTO.filter((x) => !("soloIncassi" in x && x.soloIncassi)).map((x) => ({ chiave: x.chiave, nome: x.nome }))}
          />
        </details>

        <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-600">
              <tr>
                <th className="text-left px-3 py-2">Data</th><th className="text-left px-3 py-2">Conto</th><th className="text-left px-3 py-2">Descrizione</th>
                <th className="text-right px-3 py-2">Entrate</th><th className="text-right px-3 py-2">Uscite</th><th className="text-left px-3 py-2 w-[340px]">Abbinamento</th>
              </tr>
            </thead>
            <tbody>
              {movimenti.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-neutral-500">Nessun movimento. Importa un estratto conto da «Banche e importazioni».</td></tr>}
              {movimenti.map((m) => {
                const { anno, mese } = meseDi(m.data);
                const chiuso = chiusi.has(`${anno}-${mese}`);
                const st = STATI_MOVIMENTO[m.stato];
                const residuo = residuoMovimento(m);
                const tipo = m.importo > 0 ? "INCASSO" : "PAGAMENTO";
                const sugg = m.stato === "DA_ABBINARE" && !chiuso ? suggerisci(m, candidati) : [];
                const altre = m.stato === "DA_ABBINARE" && !chiuso
                  ? candidati.filter((c) => c.tipo === tipo && c.residuo > 0.004).sort((a, b) => Math.abs(a.residuo - residuo) - Math.abs(b.residuo - residuo)).slice(0, 60)
                  : [];
                return (
                  <tr key={m.id} className={`border-t border-neutral-100 align-top ${m.stato === "DA_ABBINARE" ? "bg-amber-50/40" : ""}`}>
                    <td className="px-3 py-2 whitespace-nowrap">{dataIt(m.data)}{m.dataValuta && m.dataValuta.getTime() !== m.data.getTime() && <span className="block text-[10px] text-neutral-500">val. {dataIt(m.dataValuta)}</span>}{chiuso && <span className="block text-[10px] text-neutral-500">🔒 mese chiuso</span>}</td>
                    <td className="px-3 py-2 text-xs text-neutral-700">{m.conto.nome}{m.origine !== "IMPORT" && <span className="block text-[10px] text-purple-700 font-semibold">{m.origine === "STORNO" ? "storno" : "a mano"}</span>}</td>
                    <td className="px-3 py-2 text-neutral-800 break-words max-w-[360px]">{m.descrizione}{m.note && <span className="block text-[11px] text-neutral-500">{m.note}</span>}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-green-700 font-semibold">{m.importo > 0 ? eur(m.importo) : ""}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-orange-700 font-semibold">{m.importo < 0 ? eur(-m.importo) : ""}</td>
                    <td className="px-3 py-2 text-xs space-y-1.5">
                      <span title={st.spiega} className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${st.cls}`}>{st.label}{m.stato === "REGISTRATO" && m.categoria ? ` · ${m.categoria}` : ""}</span>
                      {m.abbinamenti.map((a) => (
                        <div key={a.id} className="flex items-start justify-between gap-2 bg-green-50 border border-green-200 rounded px-2 py-1">
                          <span>✓ <b>{a.scadenza.controparte}</b> · {a.scadenza.descrizione} · {eur(a.importo)}{a.scadenza.chiaveImport?.startsWith("FA:") && <> · <Link href={`/amministrazione/fatture-acquisto/${a.scadenza.chiaveImport.split(":")[1]}`} className="underline text-blue-800">apri la fattura</Link></>}</span>
                          {!chiuso && <form action={scollegaAbbinamento}><input type="hidden" name="id" value={a.id} /><button className="text-red-600 hover:underline" title="Scollega">✕</button></form>}
                        </div>
                      ))}
                      {m.stato === "DA_ABBINARE" && !chiuso && (
                        <>
                          {m.abbinamenti.length > 0 && <p className="text-amber-800">Restano da abbinare {eur(residuo)}</p>}
                          {sugg.map((s) => {
                            const sc = candidati.find((c) => c.id === s.scadenzaId)!;
                            return (
                              <form key={s.scadenzaId} action={abbinaMovimento} className="flex items-center justify-between gap-2 border border-neutral-200 rounded px-2 py-1 bg-white">
                                <input type="hidden" name="movimentoId" value={m.id} /><input type="hidden" name="scadenzaId" value={s.scadenzaId} />
                                <span><b>{sc.controparte}</b> · {sc.descrizione} · {eur(sc.residuo)}<span className="block text-[10px] text-neutral-500">{s.motivi.join(", ")}</span></span>
                                <button className={`btn-3d ${s.sicuro ? "btn-3d-green" : "btn-3d-blue"} text-[11px] px-2 py-0.5 whitespace-nowrap`}>Abbina</button>
                              </form>
                            );
                          })}
                          <details>
                            <summary className="cursor-pointer text-neutral-600 underline">Altra scadenza / classifica</summary>
                            <div className="space-y-2 mt-1.5">
                              {altre.length > 0 && (
                                <form action={abbinaMovimento} className="space-y-1">
                                  <input type="hidden" name="movimentoId" value={m.id} />
                                  <select name="scadenzaId" required className={`${inp} w-full`}>
                                    {altre.map((c) => <option key={c.id} value={c.id}>{c.controparte} · {c.descrizione} · {eur(c.residuo)}{c.dataScadenza ? ` · ${dataIt(c.dataScadenza)}` : ""}</option>)}
                                  </select>
                                  <div className="flex gap-1">
                                    <input name="importo" placeholder={`Importo (max ${residuo.toFixed(2).replace(".", ",")})`} className={`${inp} flex-1`} />
                                    <button className="btn-3d btn-3d-blue text-[11px] px-2">Abbina</button>
                                  </div>
                                </form>
                              )}
                              <form action={registraMovimento} className="flex gap-1">
                                <input type="hidden" name="id" value={m.id} />
                                <select name="categoria" required className={`${inp} flex-1`} defaultValue="">
                                  <option value="" disabled>Registra senza scadenza come…</option>
                                  {CATEGORIE_MOVIMENTO.map((c) => <option key={c}>{c}</option>)}
                                </select>
                                <select name="divisione" className={inp} defaultValue={m.divisione ?? ""}><option value="">Divisione…</option>{BRANDS.map((b) => <option key={b.nome}>{b.nome}</option>)}</select>
                                <button className="btn-3d btn-3d-dark text-[11px] px-2" disabled={m.abbinamenti.length > 0}>OK</button>
                              </form>
                              <Link href={`/amministrazione/scadenzario?tipo=${tipo}`} className="text-[11px] underline text-neutral-600">La scadenza non c&apos;è? Creala nello scadenzario</Link>
                            </div>
                          </details>
                        </>
                      )}
                      {m.stato === "REGISTRATO" && !chiuso && m.origine === "IMPORT" && (
                        <form action={annullaRegistrazione}><input type="hidden" name="id" value={m.id} /><button className="text-[11px] underline text-neutral-600">Annulla registrazione</button></form>
                      )}
                      {m.origine === "MANUALE" && !m.stornatoDaId && m.abbinamenti.length === 0 && (
                        <form action={stornaMovimento} className="flex gap-1">
                          <input type="hidden" name="id" value={m.id} />
                          <input name="motivo" placeholder="Motivo storno" className={`${inp} flex-1`} />
                          <button className="btn-3d btn-3d-red text-[11px] px-2">Storna</button>
                        </form>
                      )}
                      {m.origine === "MANUALE" && !m.stornatoDaId && !m.commissioneDiId && !m.confermatoIl && !chiuso && (
                        <>
                          {m.importo < 0 && m.stato === "DA_ABBINARE" && fattureDaCollegare.length > 0 && (() => {
                            const chi = (m.note ?? "").match(/Chi: ([^·]+)/)?.[1]?.trim().toLowerCase() ?? "";
                            const ord = [...fattureDaCollegare].sort((x, y) => Number(chi && y.fornitoreNome.toLowerCase().includes(chi)) - Number(chi && x.fornitoreNome.toLowerCase().includes(chi)) || Math.abs(Math.abs(x.totale) - residuo) - Math.abs(Math.abs(y.totale) - residuo)).slice(0, 80);
                            return (
                              <form action={collegaFatturaAMovimento} className="space-y-1 border border-sky-200 bg-sky-50 rounded p-1.5">
                                <input type="hidden" name="movimentoId" value={m.id} />
                                <p className="font-semibold text-sky-900">🧾 È arrivata la fattura? Collegala: si registra e risulta pagata</p>
                                <select name="fatturaId" required defaultValue="" className={`${inp} w-full`}>
                                  <option value="" disabled>Scegli la fattura ricevuta…</option>
                                  {ord.map((x) => <option key={x.id} value={x.id}>{x.fornitoreNome} · {x.tipoDocumento === "SPESE" ? "spese " : ""}n. {x.numeroFornitore ?? x.numero} del {dataIt(x.data)} · {eur(x.totale)}</option>)}
                                </select>
                                <button className="btn-3d btn-3d-blue text-[11px] px-2 py-0.5">Collega e segna pagata</button>
                              </form>
                            );
                          })()}
                          <details>
                            <summary className="cursor-pointer text-neutral-600 underline">✏️ Modifica o 🗑 elimina</summary>
                            <div className="space-y-2 mt-1.5">
                              <form action={modificaMovimentoManuale} className="grid grid-cols-2 gap-1">
                                <input type="hidden" name="id" value={m.id} />
                                <input type="date" name="data" defaultValue={m.data.toISOString().slice(0, 10)} className={inp} />
                                <select name="contoId" defaultValue={m.contoId} className={inp}>{conti.filter((c) => c.attivo || c.id === m.contoId).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
                                <input name="importo" defaultValue={Math.abs(m.importo).toFixed(2).replace(".", ",")} className={inp} title="Importo" />
                                <input name="commissione" defaultValue={commissioniDi.has(m.id) ? Math.abs(commissioniDi.get(m.id)!).toFixed(2).replace(".", ",") : ""} placeholder="Commissioni €" className={inp} />
                                <input name="descrizione" defaultValue={m.descrizione} className={`${inp} col-span-2`} />
                                <input name="note" defaultValue={m.note ?? ""} placeholder="Note" className={`${inp} col-span-2`} />
                                <button className="btn-3d btn-3d-blue text-[11px] px-2 py-0.5 col-span-2">Salva le modifiche</button>
                                {m.abbinamenti.length > 0 && <p className="col-span-2 text-[10px] text-neutral-500">L&apos;importo non può scendere sotto quanto già abbinato alle fatture ({eur(cent(Math.abs(m.importo) - residuo))}): per cambiarlo di più scollega prima la fattura (✕).</p>}
                              </form>
                              <form action={eliminaMovimentoManuale}>
                                <input type="hidden" name="id" value={m.id} />
                                <button className="btn-3d btn-3d-red text-[11px] px-2 py-0.5">🗑 Elimina il movimento</button>
                                <span className="text-[10px] text-neutral-500 ml-1">{m.abbinamenti.length > 0 ? "Le fatture collegate tornano da pagare (si riaprono)." : "Sparisce anche la commissione."}</span>
                              </form>
                            </div>
                          </details>
                        </>
                      )}
                      {m.stornatoDaId && <p className="text-[11px] text-purple-700">Stornato</p>}
                      {m.stato !== "DA_ABBINARE" && !chiuso && !m.stornatoDaId && m.origine !== "STORNO" && (
                        <form action={impostaDivisione} className="flex gap-1 items-center">
                          <input type="hidden" name="id" value={m.id} />
                          <select name="divisione" defaultValue={m.divisione ?? ""} className={`${inp} py-0.5`}><option value="">Divisione: —</option>{BRANDS.map((b) => <option key={b.nome} value={b.nome}>Divisione: {b.nome}</option>)}</select>
                          <button className="text-[11px] underline text-neutral-600">ok</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {movimenti.length >= limite && <Link href={qs({ limite: String(limite + 300) })} className="text-sm underline">Mostra altri movimenti</Link>}
      </div>
    </div>
  );
}
