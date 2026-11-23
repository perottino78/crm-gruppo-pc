// Ordini della pratica ai fornitori, in due passi chiari (Ugo 23/11/2026: «prodotti che attendono conferma, poi prodotti confermati,
// ben distinti a gruppi per fornitore, con un costo totale»): ② ordini inviati che aspettano la conferma · ③ ordini confermati, con il totale
// del fornitore e la merce da segnare come arrivata. Il passo ① «da ordinare» è la tabella con le spunte nella pagina della pratica.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { numeroOrdine } from "@/lib/ordini/calcoli";
import { registraConfermaFornitore, registraArrivi } from "@/app/ordini-actions";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" as unknown as boolean });
const giorno = (d: Date | null) => (d ? d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "");
const isoGiorno = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const inp = "border border-neutral-300 rounded px-2 py-1 text-sm bg-white";

export default async function OrdiniPerFornitore({ commessaId, puoGestire }: { commessaId: string; puoGestire: boolean }) {
  const ordini = await prisma.ordineFornitore.findMany({
    where: { commessaId, stato: { in: ["INVIATO", "CONFERMATO", "EVASO_PARZIALE", "EVASO"] } },
    include: { fornitore: { select: { ragioneSociale: true } }, righe: { select: { id: true, descrizione: true, quantita: true, arrivato: true, complemento: true }, orderBy: { createdAt: "asc" } } },
    orderBy: [{ fornitore: { ragioneSociale: "asc" } }, { anno: "asc" }, { numero: "asc" }],
  });
  const [daMagazzino, fuoriCrm] = await Promise.all([
    prisma.rigaOrdine.findMany({ where: { commessaId, daMagazzino: true }, select: { id: true, descrizione: true, quantita: true } }),
    prisma.rigaOrdine.findMany({ where: { commessaId, ordinato: true, ordineFornitoreId: null, daMagazzino: false }, select: { id: true, descrizione: true, quantita: true, fornitoreNome: true } }),
  ]);
  const attesa = ordini.filter((o) => o.stato === "INVIATO");
  const confermati = ordini.filter((o) => o.stato !== "INVIATO");
  if (!ordini.length && !daMagazzino.length && !fuoriCrm.length) return null;

  const righe = (o: (typeof ordini)[number]) => (
    <ul className="text-sm text-neutral-800 divide-y divide-neutral-100">
      {o.righe.map((r) => (
        <li key={r.id} className="py-1 flex items-start gap-2">
          <span className="flex-1">{r.complemento && <span className="mr-1.5 rounded bg-teal-100 px-1 text-[10px] font-bold text-teal-900">🧩</span>}{r.descrizione}</span>
          <span className="text-xs text-neutral-600 whitespace-nowrap">× {r.quantita}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div id="ordini-fornitori" className="mb-4 space-y-4 scroll-mt-4">
      {attesa.length > 0 && (
        <section className="rounded-xl border-2 border-amber-300 bg-amber-50/50 p-3">
          <h3 className="text-base font-bold text-amber-950">② Ordinati: aspetto la conferma del fornitore <span className="font-normal text-neutral-600">({attesa.length} {attesa.length === 1 ? "ordine" : "ordini"})</span></h3>
          <p className="text-xs text-neutral-700 mb-2">Quando il fornitore risponde, scrivi qui sotto la sua conferma: l&apos;ordine passa a «Confermati» e il totale entra nei costi della pratica.</p>
          <div className="space-y-3">
            {attesa.map((o) => (
              <div key={o.id} className="rounded-lg border border-amber-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                  <b className="text-base text-neutral-900">{o.fornitore.ragioneSociale}</b>
                  <span className="text-xs text-neutral-600">Ordine {numeroOrdine(o)}{o.inviatoIl ? ` · inviato il ${giorno(o.inviatoIl)}${o.modalitaInvio === "MANUALE" ? " (a mano / portale)" : ""}` : ""}</span>
                  <Link href={`/ordini-fornitori/${o.id}?passo=invio`} className="ml-auto text-xs text-purple-800 underline">apri l&apos;ordine</Link>
                </div>
                {righe(o)}
                {puoGestire && (
                  <form action={registraConfermaFornitore} className="mt-2 flex flex-wrap items-end gap-2 rounded bg-amber-50 p-2">
                    <input type="hidden" name="id" value={o.id} />
                    <label className="text-[11px] font-bold text-neutral-800">N° conferma<br /><input name="numeroConfermaFornitore" placeholder="facoltativo" className={`${inp} w-32`} /></label>
                    <label className="text-[11px] font-bold text-neutral-800">Consegna prevista<br /><input type="date" name="consegnaConfermata" className={inp} /></label>
                    <label className="text-[11px] font-bold text-neutral-800">Totale dell&apos;ordine € (imponibile)<br /><input name="totaleConfermato" inputMode="decimal" placeholder="es. 2.350,00" className={`${inp} w-40 border-amber-400`} /></label>
                    <button className="btn-3d btn-3d-green text-sm px-4 py-2">✅ Il fornitore ha confermato</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {confermati.length > 0 && (
        <section className="rounded-xl border-2 border-green-300 bg-green-50/40 p-3">
          <h3 className="text-base font-bold text-green-950">③ Confermati dal fornitore <span className="font-normal text-neutral-600">({confermati.length} {confermati.length === 1 ? "ordine" : "ordini"})</span></h3>
          <p className="text-xs text-neutral-700 mb-2">Un riquadro per fornitore, con il <b>costo totale</b>. Quando arriva la merce spunta le righe e premi «Segna arrivato».</p>
          <div className="space-y-3">
            {confermati.map((o) => {
              const arrivate = o.righe.filter((r) => r.arrivato).length;
              const tutto = arrivate === o.righe.length && o.righe.length > 0;
              return (
                <div key={o.id} className={`rounded-lg border bg-white p-3 ${tutto ? "border-green-400" : "border-green-200"}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                    <b className="text-base text-neutral-900">{o.fornitore.ragioneSociale}</b>
                    <span className="text-xs text-neutral-600">Ordine {numeroOrdine(o)}{o.numeroConfermaFornitore ? ` · conferma n. ${o.numeroConfermaFornitore}` : ""}{o.consegnaConfermata ? ` · consegna ${giorno(o.consegnaConfermata)}` : ""}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${tutto ? "bg-green-600 text-white" : arrivate ? "bg-amber-200 text-amber-900" : "bg-neutral-100 text-neutral-800"}`}>{tutto ? "📦 Tutto arrivato" : arrivate ? `Arrivate ${arrivate} su ${o.righe.length}` : "Merce da ricevere"}</span>
                    <b className="ml-auto text-base text-green-900">{o.totaleConfermato !== null ? eur(o.totaleConfermato) : <span className="text-sm font-normal text-amber-800">totale da scrivere</span>}</b>
                  </div>
                  {puoGestire ? (
                    <form action={registraArrivi}>
                      <input type="hidden" name="id" value={o.id} />
                      <ul className="text-sm text-neutral-800 divide-y divide-neutral-100">
                        {o.righe.map((r) => (
                          <li key={r.id} className="py-1">
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input type="checkbox" name="arrivata" value={r.id} defaultChecked={r.arrivato} className="mt-1" />
                              <span className={`flex-1 ${r.arrivato ? "text-green-900" : ""}`}>{r.complemento && <span className="mr-1.5 rounded bg-teal-100 px-1 text-[10px] font-bold text-teal-900">🧩</span>}{r.descrizione}</span>
                              <span className="text-xs text-neutral-600 whitespace-nowrap">× {r.quantita}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <button className="btn-3d btn-3d-blue text-sm px-4 py-1.5 mt-2">📦 Segna arrivato le righe spuntate</button>
                    </form>
                  ) : righe(o)}
                  {puoGestire && (
                    <form action={registraConfermaFornitore} className="mt-2 flex flex-wrap items-end gap-2 rounded bg-green-50 p-2">
                      <input type="hidden" name="id" value={o.id} />
                      <label className="text-[11px] font-bold text-neutral-800">N° conferma<br /><input name="numeroConfermaFornitore" defaultValue={o.numeroConfermaFornitore ?? ""} className={`${inp} w-28`} /></label>
                      <label className="text-[11px] font-bold text-neutral-800">Consegna<br /><input type="date" name="consegnaConfermata" defaultValue={isoGiorno(o.consegnaConfermata)} className={inp} /></label>
                      <label className="text-[11px] font-bold text-neutral-800">Costo totale € (imponibile)<br /><input name="totaleConfermato" inputMode="decimal" defaultValue={o.totaleConfermato ?? ""} className={`${inp} w-36 border-green-500`} /></label>
                      <button className="btn-3d btn-3d-outline text-xs px-3 py-1.5">💾 Salva</button>
                      <Link href={`/ordini-fornitori/${o.id}`} className="ml-auto text-xs text-purple-800 underline">apri l&apos;ordine</Link>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(daMagazzino.length > 0 || fuoriCrm.length > 0) && (
        <details className="rounded-lg border border-neutral-200 bg-white p-2">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-800">Altro materiale ({daMagazzino.length + fuoriCrm.length}): dal magazzino o ordinato fuori dal CRM</summary>
          <ul className="mt-1 text-sm text-neutral-800 divide-y divide-neutral-100">
            {daMagazzino.map((r) => <li key={r.id} className="py-1">📦 dal magazzino · {r.descrizione} × {r.quantita}</li>)}
            {fuoriCrm.map((r) => <li key={r.id} className="py-1">✔ ordinato fuori dal CRM{r.fornitoreNome ? ` (${r.fornitoreNome})` : ""} · {r.descrizione} × {r.quantita}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
