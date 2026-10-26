export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { sincronizzaScadenzeCommesse, residuoScadenza } from "@/lib/amministrazione/server";
import { cent } from "@/lib/amministrazione/estratto";
import { eur, dataIt } from "@/lib/amministrazione/costanti";

const GIORNO = 86400000;

export default async function CruscottoAmministrazione() {
  await sincronizzaScadenzeCommesse();
  const oggi = new Date();
  const inizioOggi = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate()));

  const [conti, scadenze, daAbbinare, ultimeImport] = await Promise.all([
    prisma.contoFinanziario.findMany({ where: { attivo: true }, orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
    prisma.scadenza.findMany({ where: { stato: { in: ["APERTA", "PARZIALE", "PAGATA"] } }, include: { abbinamenti: true } }),
    prisma.movimentoFinanziario.count({ where: { stato: "DA_ABBINARE" } }),
    prisma.importazioneEstratto.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  // saldi in una sola query per conto
  const saldi = await Promise.all(conti.map(async (c) => {
    const agg = await prisma.movimentoFinanziario.aggregate({ where: { contoId: c.id, data: { gt: c.dataSaldoIniziale } }, _sum: { importo: true }, _max: { data: true } });
    const imp = ultimeImport.find((i) => i.contoId === c.id && !i.nomeFile.startsWith("[ANNULLATA]"));
    const quadra = imp?.saldoFinaleBanca == null ? null : Math.abs((imp.saldoFinaleBanca ?? 0) - (imp.saldoCalcolato ?? 0)) < 0.005;
    return { conto: c, saldo: cent(c.saldoIniziale + (agg._sum.importo ?? 0)), ultimoMovimento: agg._max.data, ultimaImport: imp, quadra };
  }));
  const disponibilita = cent(saldi.reduce((t, s) => t + s.saldo, 0));
  const fido = cent(conti.reduce((t, c) => t + c.fido, 0));

  const aperte = scadenze.filter((s) => s.stato !== "PAGATA").map((s) => ({ ...s, residuo: residuoScadenza(s) }));
  const somma = (arr: { residuo: number }[]) => cent(arr.reduce((t, s) => t + s.residuo, 0));
  const scaduta = (s: { dataScadenza: Date | null }) => !!s.dataScadenza && s.dataScadenza < inizioOggi;
  const entro30 = (s: { dataScadenza: Date | null }) => !!s.dataScadenza && s.dataScadenza >= inizioOggi && s.dataScadenza < new Date(inizioOggi.getTime() + 30 * GIORNO);
  const incassi = aperte.filter((s) => s.tipo === "INCASSO");
  const pagamenti = aperte.filter((s) => s.tipo === "PAGAMENTO");

  // Previsionale a 12 settimane: lo scaduto finisce nella settimana corrente
  const settimane = Array.from({ length: 12 }, (_, i) => {
    const da = new Date(inizioOggi.getTime() + i * 7 * GIORNO);
    const a = new Date(da.getTime() + 7 * GIORNO);
    const nella = (s: { dataScadenza: Date | null }) => !!s.dataScadenza && (i === 0 ? s.dataScadenza < a : s.dataScadenza >= da && s.dataScadenza < a);
    return { da, entrate: somma(incassi.filter(nella)), uscite: somma(pagamenti.filter(nella)) };
  });
  let progressivo = disponibilita;
  const previsione = settimane.map((w) => { progressivo = cent(progressivo + w.entrate - w.uscite); return { ...w, saldo: progressivo }; });
  const senzaData = { entrate: somma(incassi.filter((s) => !s.dataScadenza)), uscite: somma(pagamenti.filter((s) => !s.dataScadenza)) };

  // Incassi arrivati in banca ma non ancora segnati nella commessa (per sbloccare il flusso)
  const daSegnare = scadenze.filter((s) => s.commessaId && s.stato === "PAGATA" && s.abbinamenti.length > 0);
  const commesseDaSegnare = daSegnare.length
    ? await prisma.commessa.findMany({ where: { id: { in: daSegnare.map((s) => s.commessaId!) } }, include: { cliente: { select: { nome: true } } } })
    : [];
  const avvisiCommesse = daSegnare.flatMap((s) => {
    const c = commesseDaSegnare.find((x) => x.id === s.commessaId);
    if (!c) return [];
    const manca = s.origine === "COMMESSA_ACCONTO" ? !c.accontoIncassato : !c.saldoIncassato;
    return manca ? [{ s, c }] : [];
  });

  const urgenti = aperte.filter(scaduta).sort((a, b) => a.dataScadenza!.getTime() - b.dataScadenza!.getTime()).slice(0, 8);

  // grafico
  const W = 720, H = 200, pad = 30;
  const maxBar = Math.max(1, ...previsione.flatMap((w) => [w.entrate, w.uscite]));
  const saldiP = previsione.map((w) => w.saldo).concat(disponibilita);
  const minS = Math.min(0, ...saldiP), maxS = Math.max(1, ...saldiP);
  const col = (W - pad * 2) / previsione.length;
  const yS = (v: number) => pad + (H - pad * 2) * (1 - (v - minS) / (maxS - minS || 1));

  return (
    <div className="space-y-6">
      {conti.length === 0 && (
        <div className="bg-sky-50 border border-sky-300 rounded-lg p-4 text-sm text-sky-900">
          <b>Primo passo:</b> crea i conti correnti (e la cassa) con il saldo di partenza in <Link href="/amministrazione/banche" className="underline font-semibold">Banche e importazioni</Link>, poi importa gli estratti conto.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi titolo="Disponibilità sui conti" valore={eur(disponibilita)} nota={fido ? `con fido: ${eur(disponibilita + fido)}` : undefined} colore="text-neutral-900" />
        <Kpi titolo="Incassi scaduti" valore={eur(somma(incassi.filter(scaduta)))} nota={`${incassi.filter(scaduta).length} scadenze`} colore="text-red-600" href="/amministrazione/scadenzario?tipo=INCASSO&periodo=scadute" />
        <Kpi titolo="Da incassare 30 giorni" valore={eur(somma(incassi.filter(entro30)))} nota={`${eur(senzaData.entrate)} senza data (saldi commesse)`} colore="text-green-700" href="/amministrazione/scadenzario?tipo=INCASSO&periodo=30" />
        <Kpi titolo="Da pagare 30 giorni" valore={eur(somma(pagamenti.filter(entro30)) + somma(pagamenti.filter(scaduta)))} nota={pagamenti.filter(scaduta).length ? `di cui scaduti ${eur(somma(pagamenti.filter(scaduta)))}` : undefined} colore="text-orange-700" href="/amministrazione/scadenzario?tipo=PAGAMENTO&periodo=30" />
      </div>

      {(daAbbinare > 0 || avvisiCommesse.length > 0 || saldi.some((s) => s.quadra === false)) && (
        <div className="space-y-2">
          {saldi.filter((s) => s.quadra === false).map((s) => (
            <Avviso key={s.conto.id} colore="red" testo={<><b>Quadratura non riuscita su {s.conto.nome}:</b> la banca dice {eur(s.ultimaImport!.saldoFinaleBanca!)}, il CRM {eur(s.ultimaImport!.saldoCalcolato!)} (differenza {eur((s.ultimaImport!.saldoFinaleBanca ?? 0) - (s.ultimaImport!.saldoCalcolato ?? 0))}). Controlla saldo iniziale e periodi importati.</>} href="/amministrazione/banche" />
          ))}
          {daAbbinare > 0 && <Avviso colore="amber" testo={<><b>{daAbbinare} movimenti bancari da abbinare</b> a una scadenza o da classificare.</>} href="/amministrazione/prima-nota?stato=DA_ABBINARE" />}
          {avvisiCommesse.map(({ s, c }) => (
            <Avviso key={s.id} colore="green" testo={<><b>{s.origine === "COMMESSA_ACCONTO" ? "Acconto" : "Saldo"} arrivato in banca</b> per {c.cliente.nome} ({s.descrizione}) ma non ancora segnato nella commessa: segnalo lì per far partire il flusso.</>} href={`/commesse/${c.id}`} />
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1 bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="font-bold text-neutral-900 mb-3">Conti</h2>
          {saldi.length === 0 && <p className="text-sm text-neutral-500">Nessun conto.</p>}
          <div className="space-y-2">
            {saldi.map((s) => (
              <Link key={s.conto.id} href={`/amministrazione/prima-nota?conto=${s.conto.id}`} className="block border border-neutral-200 rounded-md p-3 hover:bg-neutral-50">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-semibold text-sm text-neutral-900">{s.conto.nome}</p>
                    <p className="text-[11px] text-neutral-500">{s.conto.tipo === "CASSA" ? "Cassa" : s.conto.banca ?? "Conto"} · ultimo mov. {dataIt(s.ultimoMovimento)}</p>
                  </div>
                  <p className={`font-bold text-sm ${s.saldo < 0 ? "text-red-600" : "text-neutral-900"}`}>{eur(s.saldo)}</p>
                </div>
                <p className="text-[11px] mt-1">
                  {s.quadra === true && <span className="text-green-700 font-semibold">✓ quadra con la banca</span>}
                  {s.quadra === false && <span className="text-red-600 font-semibold">✗ non quadra</span>}
                  {s.quadra === null && s.conto.tipo !== "CASSA" && <span className="text-neutral-500">quadratura non verificata</span>}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="lg:col-span-2 bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="font-bold text-neutral-900">Previsione di cassa — prossime 12 settimane</h2>
          <p className="text-[11px] text-neutral-500 mb-2">Barre: <span className="text-green-700 font-semibold">entrate</span> e <span className="text-orange-600 font-semibold">uscite</span> attese dallo scadenzario (lo scaduto è nella prima settimana). Linea: saldo previsto.</p>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full min-w-[560px]" role="img" aria-label="Previsione di cassa">
              <line x1={pad} x2={W - pad} y1={yS(0)} y2={yS(0)} stroke="#d4d4d4" strokeDasharray="4 3" />
              {previsione.map((w, i) => {
                const x = pad + i * col;
                const hE = ((H - pad * 2) * w.entrate) / maxBar / 2;
                const hU = ((H - pad * 2) * w.uscite) / maxBar / 2;
                return (
                  <g key={i}>
                    <rect x={x + col * 0.15} width={col * 0.32} y={H - pad - hE} height={hE} fill="#16a34a" opacity="0.75"><title>Entrate {eur(w.entrate)}</title></rect>
                    <rect x={x + col * 0.5} width={col * 0.32} y={H - pad - hU} height={hU} fill="#ea580c" opacity="0.75"><title>Uscite {eur(w.uscite)}</title></rect>
                    <text x={x + col / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#525252">{w.da.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</text>
                  </g>
                );
              })}
              <polyline fill="none" stroke="#1e3a5f" strokeWidth="2.5" points={previsione.map((w, i) => `${pad + i * col + col / 2},${yS(w.saldo)}`).join(" ")} />
              {previsione.map((w, i) => <circle key={i} cx={pad + i * col + col / 2} cy={yS(w.saldo)} r="3" fill={w.saldo < 0 ? "#dc2626" : "#1e3a5f"}><title>Saldo previsto {eur(w.saldo)}</title></circle>)}
            </svg>
          </div>
          <p className="text-xs text-neutral-700 mt-1">Saldo previsto fra 12 settimane: <b className={previsione[11].saldo < 0 ? "text-red-600" : ""}>{eur(previsione[11].saldo)}</b>
            {senzaData.entrate > 0 && <> · non conteggiati {eur(senzaData.entrate)} di saldi commesse senza data (si incassano prima della posa)</>}</p>
        </section>
      </div>

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-neutral-900">Scadute da gestire</h2>
          <Link href="/amministrazione/scadenzario?periodo=scadute" className="text-sm underline">Tutto lo scadenzario →</Link>
        </div>
        {urgenti.length === 0 ? <p className="text-sm text-neutral-500">Nessuna scadenza scaduta. 👍</p> : (
          <table className="w-full text-sm">
            <tbody>
              {urgenti.map((s) => (
                <tr key={s.id} className="border-t border-neutral-100">
                  <td className="py-1.5 text-red-600 font-semibold w-24">{dataIt(s.dataScadenza)}</td>
                  <td className="py-1.5 w-24">{s.tipo === "INCASSO" ? "Incasso" : "Pagamento"}</td>
                  <td className="py-1.5 font-semibold">{s.controparte}</td>
                  <td className="py-1.5 text-neutral-600">{s.descrizione}</td>
                  <td className="py-1.5 text-right font-bold">{eur(s.residuo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Kpi({ titolo, valore, nota, colore, href }: { titolo: string; valore: string; nota?: string; colore: string; href?: string }) {
  const corpo = (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 h-full hover:shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{titolo}</p>
      <p className={`text-xl font-extrabold mt-1 ${colore}`}>{valore}</p>
      {nota && <p className="text-[11px] text-neutral-500 mt-1">{nota}</p>}
    </div>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}

function Avviso({ testo, colore, href }: { testo: React.ReactNode; colore: "red" | "amber" | "green"; href: string }) {
  const cls = { red: "bg-red-50 border-red-300 text-red-900", amber: "bg-amber-50 border-amber-300 text-amber-900", green: "bg-green-50 border-green-300 text-green-900" }[colore];
  return (
    <Link href={href} className={`flex justify-between items-center gap-3 border rounded-lg px-4 py-2.5 text-sm ${cls}`}>
      <span>{testo}</span><span className="font-semibold whitespace-nowrap">Apri →</span>
    </Link>
  );
}
