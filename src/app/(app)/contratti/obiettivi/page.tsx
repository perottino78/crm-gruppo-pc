export const dynamic = "force-dynamic";

// Obiettivi di fatturato e premi dei commerciali (amministrazione/fatturazione): mese e anno, con la tabella di marcia
// e l'email del lunedì «sei in linea?».
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { chiaveGiorno } from "@/lib/calendario/tempo";
import { contrattiDi, gestisceProvvigioni, eVenditore } from "@/lib/provvigioni/server";
import { avanzamento, nomePeriodo, vendutoNelPeriodo, NOMI_STATO_OBIETTIVO, periodoMese, estremi, MESI } from "@/lib/provvigioni/obiettivi";
import { emailObiettiviAttiva } from "@/lib/provvigioni/obiettivi-server";
import { salvaObiettiviCommerciale, impostaEmailObiettivi, mandaOraEmailObiettivi } from "@/app/provvigioni-actions";

const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default async function ObiettiviPage({ searchParams }: { searchParams: Promise<{ mese?: string; ok?: string; errore?: string }> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!gestisceProvvigioni(u)) redirect("/contratti");
  const p = await searchParams;
  const oggi = chiaveGiorno(new Date());
  const mese = /^\d{4}-\d{2}$/.test(p.mese ?? "") ? p.mese! : periodoMese(oggi);
  const anno = mese.slice(0, 4);
  // giorno di riferimento per la tabella di marcia: oggi se il mese è quello in corso, altrimenti il mese intero (passato) o nulla (futuro)
  const rif = mese === periodoMese(oggi) ? oggi : mese < periodoMese(oggi) ? estremi(mese).a : estremi(mese).da;

  // commerciali attivi, chi vende pur avendo un altro ruolo (Ugo) e chi ha già un obiettivo nel periodo
  const persone = (await prisma.utente.findMany({
    where: { OR: [{ stato: "ATTIVO", ruolo: { in: ["COMMERCIALE", "AMMINISTRATORE"] } }, { stato: "ATTIVO", vende: true }, { obiettivi: { some: { periodo: { in: [mese, anno] } } } }] },
    select: { id: true, nome: true, username: true, email: true, stato: true, ruolo: true, vende: true, obiettivi: { where: { periodo: { in: [mese, anno] } } } },
    orderBy: { nome: "asc" },
  })).filter((x) => eVenditore(x) || x.obiettivi.length > 0);
  const contratti = await contrattiDi(persone.map((x) => ({ id: x.id, nome: x.nome, username: x.username })));
  const attiva = await emailObiettiviAttiva();
  const [aa, mm] = mese.split("-").map(Number);
  const meseVicino = (d: number) => { const t = new Date(Date.UTC(aa, mm - 1 + d, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`; };
  const campo = "rounded-md border border-neutral-300 px-2 py-1 text-sm";

  return (
    <div className="max-w-6xl space-y-4">
      <Link href="/contratti" className="btn-indietro">← Contratti e provvigioni</Link>
      <div>
        <h1 className="text-2xl font-extrabold text-neutral-900">🎯 Obiettivi e premi dei commerciali</h1>
        <p className="text-sm text-neutral-600">
          Per ogni commerciale l&apos;obiettivo di fatturato (venduto: imponibile dei contratti firmati) del mese e dell&apos;anno, con il premio se lo raggiunge.
          La tabella di marcia dice dove dovrebbe essere a oggi; ogni lunedì gli arriva un&apos;email con il punto e due parole di incoraggiamento.
        </p>
      </div>
      {p.ok && <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">✅ {p.ok}</p>}
      {p.errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{p.errore}</p>}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm">
        <Link href={`/contratti/obiettivi?mese=${meseVicino(-1)}`} className="btn-3d btn-3d-outline px-2 py-1 text-xs">◀</Link>
        <b className="min-w-[130px] text-center capitalize">{MESI[mm - 1]} {anno}</b>
        <Link href={`/contratti/obiettivi?mese=${meseVicino(1)}`} className="btn-3d btn-3d-outline px-2 py-1 text-xs">▶</Link>
        <span className="mx-2 h-5 w-px bg-neutral-200" />
        <form action={impostaEmailObiettivi} className="flex items-center gap-2">
          <input type="hidden" name="attiva" value={attiva ? "0" : "1"} />
          <span>📧 Email del lunedì: <b className={attiva ? "text-green-700" : "text-neutral-500"}>{attiva ? "accesa" : "spenta"}</b></span>
          <button className="btn-3d btn-3d-outline px-2 py-1 text-xs">{attiva ? "Spegni" : "Accendi"}</button>
        </form>
        <form action={mandaOraEmailObiettivi}>
          <button className="btn-3d btn-3d-blue px-2 py-1 text-xs">Manda adesso a tutti</button>
        </form>
      </div>

      <div className="space-y-2">
        {persone.length === 0 && <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-600">Nessun commerciale attivo.</p>}
        {persone.map((x) => {
          const suoi = contratti.filter((c) => c.commercialeId === x.id);
          const oM = x.obiettivi.find((o) => o.periodo === mese), oA = x.obiettivi.find((o) => o.periodo === anno);
          const avM = oM ? avanzamento(oM.importoTarget, vendutoNelPeriodo(suoi, mese), mese, rif) : null;
          const avA = oA ? avanzamento(oA.importoTarget, vendutoNelPeriodo(suoi, anno), anno, rif) : null;
          return (
            <form key={x.id} id={`u-${x.id}`} action={salvaObiettiviCommerciale} className="grid gap-2 rounded-lg border border-neutral-200 bg-white p-3 lg:grid-cols-[180px_1fr_1fr_auto] lg:items-end [&>*]:min-w-0">
              <input type="hidden" name="utenteId" value={x.id} /><input type="hidden" name="mese" value={mese} /><input type="hidden" name="anno" value={anno} />
              <input type="hidden" name="torna" value={`/contratti/obiettivi?mese=${mese}`} />
              <div>
                <Link href={`/contratti?persona=${x.id}`} className="font-bold text-blue-800 underline">{x.nome}</Link>
                <p className="text-[11px] text-neutral-500">{x.email ?? "⚠️ senza email"}{x.stato !== "ATTIVO" ? ` · ${x.stato.toLowerCase()}` : ""}</p>
              </div>
              <fieldset className="rounded-md border border-neutral-200 p-2">
                <legend className="px-1 text-xs font-semibold text-neutral-700">📅 {nomePeriodo(mese)}</legend>
                <div className="flex flex-wrap gap-2">
                  <label className="text-xs">Obiettivo €<input name="targetMese" type="number" step="100" min="0" defaultValue={oM?.importoTarget ?? ""} className={`${campo} block w-28`} /></label>
                  <label className="text-xs">Premio €<input name="premioMese" type="number" step="10" min="0" defaultValue={oM?.premio ?? ""} className={`${campo} block w-24`} /></label>
                </div>
                {avM && <p className="mt-1 text-[11px] text-neutral-600">{eur(avM.venduto)} = {Math.round(avM.percentuale * 100)}% · {NOMI_STATO_OBIETTIVO[avM.stato]}</p>}
              </fieldset>
              <fieldset className="rounded-md border border-neutral-200 p-2">
                <legend className="px-1 text-xs font-semibold text-neutral-700">📈 {nomePeriodo(anno)}</legend>
                <div className="flex flex-wrap gap-2">
                  <label className="text-xs">Obiettivo €<input name="targetAnno" type="number" step="1000" min="0" defaultValue={oA?.importoTarget ?? ""} className={`${campo} block w-28`} /></label>
                  <label className="text-xs">Premio €<input name="premioAnno" type="number" step="10" min="0" defaultValue={oA?.premio ?? ""} className={`${campo} block w-24`} /></label>
                </div>
                {avA && <p className="mt-1 text-[11px] text-neutral-600">{eur(avA.venduto)} = {Math.round(avA.percentuale * 100)}% · {NOMI_STATO_OBIETTIVO[avA.stato]}</p>}
              </fieldset>
              <div className="flex flex-col gap-1">
                <label className="text-xs">Nota per lui<input name="note" defaultValue={oM?.note ?? oA?.note ?? ""} placeholder="es. premio pagato a gennaio" className={`${campo} block w-full lg:w-48`} /></label>
                <button className="btn-3d btn-3d-green px-3 py-1 text-xs">💾 Salva</button>
              </div>
            </form>
          );
        })}
      </div>
      <p className="text-xs text-neutral-500">Obiettivo vuoto o 0 = nessun obiettivo per quel periodo. Il venduto conta le commesse del CRM (data della commessa) e i progetti BConsole.</p>
    </div>
  );
}
