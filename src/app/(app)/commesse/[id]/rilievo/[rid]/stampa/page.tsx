export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { numeroCommessa } from "@/lib/commesse";
import BottoneStampa from "@/components/BottoneStampa";
import { SEZIONI_VERBALE, verbaleDiPartenza, type Verbale } from "@/lib/rilievo/verbale";

// Verbale di sopralluogo e rilievo misure da stampare (o salvare in PDF), con le misure e le foto del rilievo (richiesta di Ugo 21/11/2026).
const arancio = "#c8703a";
const it = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });

function Barra({ children }: { children: React.ReactNode }) {
  return <div className="no-spezza mt-3 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white" style={{ background: arancio }}>{children}</div>;
}
function Spunta({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <span className="inline-flex items-start gap-1 pr-3 text-[11px]"><span className="mt-[1px] inline-block h-3 w-3 shrink-0 border border-neutral-700 text-center text-[10px] leading-[10px]">{on ? "✕" : ""}</span>{children}</span>;
}
function Riga({ etichetta, valore }: { etichetta: string; valore?: string | null }) {
  return <p className="text-[11px] leading-5"><b>{etichetta}:</b> <span className="border-b border-neutral-300 px-1">{valore || "          "}</span></p>;
}

export default async function StampaRilievoPage({ params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params;
  const u = await getCurrentUser();
  if (!u) notFound();
  const r = await prisma.rilievo.findFirst({
    where: { id: rid, commessaId: id },
    include: { tecnico: { select: { nome: true } }, allegati: { select: { id: true, nome: true }, orderBy: { id: "asc" } }, commessa: { include: { cliente: true, preventivo: { select: { numeroOfferta: true, createdAt: true } }, righeOrdine: { select: { descrizione: true, quantita: true } } } } },
  });
  if (!r) notFound();
  const c = r.commessa;
  const v: Verbale = verbaleDiPartenza(r.verbale, c.righeOrdine);
  const indirizzo = r.indirizzo ?? [c.cliente.indirizzo, c.cliente.cap, c.cliente.comune, c.cliente.provincia].filter(Boolean).join(", ");
  const righe = [...v.righe];
  while (righe.length < 7) righe.push({ tipo: "", larg: "", alt: "", q: "", note: "" });
  const pdf = r.allegati.filter((a) => /\.pdf$/i.test(a.nome ?? ""));
  const foto = r.allegati.filter((a) => !/\.pdf$/i.test(a.nome ?? ""));
  const sez = (idS: string) => SEZIONI_VERBALE.find((s) => s.id === idS)!;
  return (
    <div className="mx-auto max-w-[800px] bg-white p-2 text-neutral-900 print:max-w-none print:p-0">
      <style>{`@page { size: A4; margin: 10mm; } .no-spezza { break-inside: avoid; } .salto { break-before: page; }`}</style>
      <div className="print:hidden mb-3 flex flex-wrap items-center gap-2 pr-48">
        <Link href={`/commesse/${id}?passo=RILIEVO&carica=${rid}`} className="btn-indietro">← Torna al rilievo</Link>
        <BottoneStampa />
        <span className="text-xs text-neutral-500">Stampa il verbale con le misure e le foto del rilievo; i PDF caricati vanno stampati a parte.</span>
      </div>

      <div className="flex items-start justify-between px-3 py-3 text-white" style={{ background: arancio }}>
        <div className="text-[11px] leading-4"><b className="text-base">P&amp;C GRUPPO</b><br />Corso Moncenisio 28 — 10090 Rosta (TO)<br />Tel. 011 1988 7497 · info@gruppopec.com · www.gruppopec.com</div>
        <div className="text-right"><b className="text-lg leading-5">VERBALE DI SOPRALLUOGO<br />E RILIEVO MISURE</b><br /><span className="text-[10px]">Rev. 1.0 — 2026</span></div>
      </div>

      <Barra>1 — Dati cliente / cantiere</Barra>
      <div className="grid grid-cols-2 gap-x-6 px-1 pt-1">
        <Riga etichetta="Cliente / Ragione sociale" valore={c.cliente.nome} />
        <Riga etichetta="Codice cliente / Pratica" valore={numeroCommessa(c)} />
        <div className="col-span-2"><Riga etichetta="Indirizzo immobile" valore={indirizzo} /></div>
        <Riga etichetta="Telefono" valore={c.cliente.cellulare ?? c.cliente.telefono} />
        <Riga etichetta="E-mail" valore={c.cliente.email} />
        <Riga etichetta="Data sopralluogo" valore={it(r.dataOra)} />
        <Riga etichetta="Tecnico rilevatore" valore={r.tecnico.nome} />
        <Riga etichetta="N. preventivo" valore={c.preventivo?.numeroOfferta ? `${c.preventivo.numeroOfferta}/${c.preventivo.createdAt.getFullYear()}` : ""} />
        <Riga etichetta="Riferimento interno" valore={v.rif_interno} />
      </div>

      {SEZIONI_VERBALE.filter((s) => s.id !== "finali").map((s) => (
        <div key={s.id} className="no-spezza">
          <Barra>{s.titolo}</Barra>
          <div className="space-y-1 px-1 pt-1">
            {s.campi.map((cm) => {
              const val = v.campi[cm.k];
              if (cm.tipo === "spunte") {
                const on = Array.isArray(val) ? val : [];
                return <div key={cm.k}><p className="text-[10px] font-bold text-neutral-600">{cm.label}</p><div className="flex flex-wrap">{cm.opzioni.map((o) => <Spunta key={o} on={on.includes(o)}>{o}</Spunta>)}</div></div>;
              }
              if (cm.tipo === "area") return <div key={cm.k}><p className="text-[10px] font-bold text-neutral-600">{cm.label}</p><div className="min-h-10 whitespace-pre-wrap border border-neutral-300 bg-neutral-50 p-1 text-[11px]">{typeof val === "string" ? val : ""}</div></div>;
              return <Riga key={cm.k} etichetta={cm.label} valore={typeof val === "string" ? val : ""} />;
            })}
          </div>
        </div>
      ))}

      <div className="no-spezza">
        <Barra>6 — Riepilogo prodotti da installare</Barra>
        <table className="mt-1 w-full border-collapse text-[11px]">
          <thead><tr style={{ background: arancio }} className="text-white">{["N.", "Tipo prodotto / posizione", "Larg.", "Alt.", "Q.", "Note tecniche"].map((h) => <th key={h} className="border border-neutral-400 px-1 py-0.5 text-left">{h}</th>)}</tr></thead>
          <tbody>
            {righe.map((x, i) => (
              <tr key={i} className={i % 2 ? "bg-white" : "bg-neutral-100"}>
                <td className="w-6 border border-neutral-300 px-1">{i + 1}</td><td className="border border-neutral-300 px-1 py-1">{x.tipo}</td><td className="w-14 border border-neutral-300 px-1">{x.larg}</td>
                <td className="w-14 border border-neutral-300 px-1">{x.alt}</td><td className="w-8 border border-neutral-300 px-1">{x.q}</td><td className="border border-neutral-300 px-1">{x.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="no-spezza">
        <Barra>{sez("finali").titolo}</Barra>
        <div className="mt-1 min-h-16 whitespace-pre-wrap border border-neutral-300 bg-neutral-50 p-1 text-[11px]">{typeof v.campi.note_finali === "string" ? v.campi.note_finali : ""}</div>
        <p className="mt-3 border-t pt-1 text-[10px] text-neutral-700">Il Cliente dichiara di aver preso visione delle condizioni dell&apos;immobile documentate nel presente verbale e di confermare che quanto riportato corrisponde allo stato dei luoghi al momento del sopralluogo e rilievo misure. P&amp;C S.r.l. non potrà essere ritenuta responsabile di danni, graffi, macchie o condizioni preesistenti descritte nel presente documento.</p>
        <div className="mt-5 grid grid-cols-2 gap-8 text-[10px] text-neutral-600">
          <div><p>Firma Tecnico Rilevatore P&amp;C S.r.l.</p><p className="mt-6 border-b border-neutral-500">Nome: {r.tecnico.nome} &nbsp; Data: {it(r.dataOra)}</p></div>
          <div><p>Firma Cliente (presa visione e accettazione)</p><p className="mt-6 border-b border-neutral-500">Nome:</p></div>
        </div>
      </div>

      {(r.misure || r.note || foto.length > 0 || pdf.length > 0) && (
        <div className="salto pt-2">
          <Barra>Misure e rilievo — {c.cliente.nome} · {numeroCommessa(c)} · {it(r.dataOra)}</Barra>
          {r.misure && <pre className="mt-2 whitespace-pre-wrap text-[12px]">{r.misure}</pre>}
          {r.note && <p className="mt-2 text-[11px]"><b>Note:</b> {r.note}</p>}
          {pdf.length > 0 && <p className="mt-2 text-[11px] print:hidden">📄 PDF del rilievo (da stampare a parte): {pdf.map((a) => <a key={a.id} href={`/api/foto/rilievo/${a.id}`} target="_blank" rel="noreferrer" className="mr-3 text-blue-800 underline">{a.nome}</a>)}</p>}
          {pdf.length > 0 && <p className="mt-2 hidden text-[11px] print:block">PDF allegati al rilievo: {pdf.map((a) => a.nome).join(", ")}</p>}
          {foto.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {foto.map((a) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.id} src={`/api/foto/rilievo/${a.id}`} alt={a.nome ?? "foto rilievo"} className="no-spezza max-h-[110mm] w-full object-contain border border-neutral-300" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
