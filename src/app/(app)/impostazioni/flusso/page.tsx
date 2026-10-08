export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { UFFICI } from "@/lib/flusso";
import { assicuraFlusso, salvaFlussoFase, creaFlussoFase, eliminaFlussoFase } from "@/app/flusso-actions";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm w-full";

export default async function FlussoImpostazioniPage() {
  const u = await getCurrentUser();
  if (!isAmministratore(u)) return <p className="text-sm text-neutral-700">Sezione riservata all&apos;amministratore.</p>;
  await assicuraFlusso();
  const fasi = await prisma.flussoFase.findMany({ orderBy: { ordine: "asc" } });
  return (
    <div className="max-w-4xl">
      <Link href="/impostazioni" className="text-xs text-blue-700 underline">← Impostazioni</Link>
      <h1 className="text-2xl font-extrabold text-neutral-900 mt-1 mb-1">Flusso pratiche fra uffici</h1>
      <p className="text-sm text-neutral-700 mb-1">
        Per ogni fase scegli l&apos;ufficio che la porta avanti, la fase successiva (a cui passa premendo <b>Fatto</b>), il testo del task e, se vuoi, l&apos;email.
      </p>
      <p className="text-xs text-neutral-600 mb-4">
        Campi utilizzabili nei testi: <code>{"{cliente}"}</code> <code>{"{commessa}"}</code> <code>{"{offerta}"}</code> <code>{"{importo}"}</code> <code>{"{commerciale}"}</code> <code>{"{ufficioPrecedente}"}</code>.
        L&apos;email viene preparata come bozza pronta da aprire nel programma di posta e inviare.
      </p>
      <div className="flex flex-col gap-4 mb-6">
        {fasi.map((f) => (
          <form key={f.id} action={salvaFlussoFase} className="card-fase bg-white rounded-lg border border-neutral-200 p-4 flex flex-col gap-3" style={{ "--fase": "#2563eb" } as React.CSSProperties}>
            <input type="hidden" name="id" value={f.id} />
            <div className="grid grid-cols-6 gap-2">
              <div className="col-span-1"><label className="text-[11px] font-bold text-neutral-700">N°</label><input name="ordine" type="number" defaultValue={f.ordine} className={inp} /></div>
              <div className="col-span-2"><label className="text-[11px] font-bold text-neutral-700">Nome fase</label><input name="nome" defaultValue={f.nome} className={inp} /></div>
              <div className="col-span-1"><label className="text-[11px] font-bold text-neutral-700">Ufficio</label>
                <select name="ufficio" defaultValue={f.ufficio} className={inp}>{UFFICI.map((x) => <option key={x.chiave} value={x.chiave}>{x.nome}</option>)}</select></div>
              <div className="col-span-2"><label className="text-[11px] font-bold text-neutral-700">Alla conferma passa a</label>
                <select name="prossimaChiave" defaultValue={f.prossimaChiave ?? ""} className={inp}>
                  <option value="">— fine flusso —</option>
                  {fasi.filter((x) => x.id !== f.id).map((x) => <option key={x.id} value={x.chiave}>{x.nome}</option>)}
                </select></div>
            </div>
            <label className="text-sm font-bold flex items-center gap-2"><input type="checkbox" name="taskAttivo" defaultChecked={f.taskAttivo} /> Crea il task per questo ufficio</label>
            <div><label className="text-[11px] font-bold text-neutral-700">Titolo del task</label><input name="taskTitolo" defaultValue={f.taskTitolo} className={inp} /></div>
            <div><label className="text-[11px] font-bold text-neutral-700">Testo del task</label><textarea name="taskTesto" defaultValue={f.taskTesto ?? ""} rows={2} className={inp} /></div>
            <div className="rounded border border-purple-200 bg-purple-50 p-3 flex flex-col gap-2">
              <label className="text-sm font-bold flex items-center gap-2"><input type="checkbox" name="mailAttiva" defaultChecked={f.mailAttiva} /> ✉ Prepara una email per questa fase</label>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[11px] font-bold text-neutral-700">Quando</label>
                  <select name="mailQuando" defaultValue={f.mailQuando} className={inp}>
                    <option value="INIZIO">All&apos;avvio della fase (quando nasce il task)</option>
                    <option value="FATTO">Quando la fase è completata (Fatto)</option>
                  </select></div>
                <div><label className="text-[11px] font-bold text-neutral-700">Destinatario</label>
                  <select name="mailDestinatario" defaultValue={f.mailDestinatario} className={inp}>
                    <option value="CLIENTE">Cliente</option>
                    <option value="INTERNO">Interno (indirizzo da inserire)</option>
                  </select></div>
              </div>
              <div><label className="text-[11px] font-bold text-neutral-700">Oggetto</label><input name="mailOggetto" defaultValue={f.mailOggetto ?? ""} className={inp} /></div>
              <div><label className="text-[11px] font-bold text-neutral-700">Testo email</label><textarea name="mailTesto" defaultValue={f.mailTesto ?? ""} rows={5} className={inp} /></div>
            </div>
            <div className="flex gap-2">
              <button className="btn-3d btn-3d-green text-sm px-4 py-2">Salva fase</button>
              <button formAction={eliminaFlussoFase} className="btn-3d btn-3d-red text-sm px-4 py-2">Elimina</button>
            </div>
          </form>
        ))}
      </div>
      <form action={creaFlussoFase} className="bg-white rounded-lg border border-neutral-200 p-4 flex flex-wrap items-end gap-2">
        <div><label className="text-[11px] font-bold text-neutral-700">Nuova fase</label><input name="nome" required placeholder="es. Chiamata di benvenuto" className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-64" /></div>
        <div><label className="text-[11px] font-bold text-neutral-700">Ufficio</label>
          <select name="ufficio" className="border border-neutral-300 rounded px-2 py-1.5 text-sm">{UFFICI.map((x) => <option key={x.chiave} value={x.chiave}>{x.nome}</option>)}</select></div>
        <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Aggiungi fase</button>
      </form>
    </div>
  );
}
