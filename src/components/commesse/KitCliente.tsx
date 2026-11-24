// Riquadro «🎁 Kit al cliente» nella pratica: si registra la consegna del kit dopo la posa (raccolta punti).
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { puo, type ConPermessi } from "@/lib/permessi/catalogo";
import { puoConsegnareKit, puntiConsegna } from "@/lib/kit/punti";
import { regoleKit } from "@/lib/kit/server";
import { perInput } from "@/lib/calendario/tempo";
import { registraKitCliente, segnaRecensioneKit, annullaKitCliente } from "@/app/kit-cliente-actions";
import FotoRilievo from "@/components/FotoRilievo";
import BottoneConferma from "@/components/BottoneConferma";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";

export default async function KitCliente({ commessaId, stato, commercialeId, utente, ok, errore }: {
  commessaId: string; stato: string; commercialeId: string; utente: ConPermessi | null; ok?: string; errore?: string;
}) {
  const [kit, regole] = await Promise.all([prisma.consegnaKit.findUnique({ where: { commessaId } }), regoleKit()]);
  const persone = kit || !puoConsegnareKit(stato) ? [] : await prisma.utente.findMany({
    where: { stato: "ATTIVO", OR: [{ ruolo: { in: ["COMMERCIALE", "AMMINISTRATORE"] } }, { vende: true }, { id: commercialeId }] },
    select: { id: true, nome: true }, orderBy: { nome: "asc" },
  });
  const gestisce = puo(utente, "kit.regole");
  return (
    <section id="kit-cliente" className="card-fase scroll-mt-4" style={{ "--fase": "#db2777" } as React.CSSProperties}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2>🎁 Kit al cliente</h2>
        <Link href="/kit" className="text-xs text-blue-800 underline">classifica della raccolta punti</Link>
      </div>
      {ok && <p className="mb-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {ok}</p>}
      {errore && <p className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errore}</p>}
      {kit ? (
        <div className="space-y-2 text-sm">
          <p className="text-neutral-900">
            Consegnato da <b>{kit.utenteNome}</b> il {kit.consegnatoIl.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}
            {kit.conFoto ? " · 📷 con foto (in Documenti › Consegna kit)" : ""}{kit.recensione ? " · ⭐ con recensione" : ""}
            {" · "}<b className="text-pink-700">{kit.punti} punti</b>
          </p>
          {kit.nota && <p className="text-xs text-neutral-600">Nota: {kit.nota}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <form action={segnaRecensioneKit}>
              <input type="hidden" name="id" value={kit.id} />
              <input type="hidden" name="recensione" value={kit.recensione ? "0" : "1"} />
              <button className={`btn-3d ${kit.recensione ? "btn-3d-outline" : "btn-3d-amber"} px-3 py-1 text-xs`}>
                {kit.recensione ? "Togli la recensione" : `⭐ Il cliente ha lasciato la recensione (+${regole.puntiRecensione} punti)`}
              </button>
            </form>
            {gestisce && (
              <form action={annullaKitCliente}>
                <input type="hidden" name="id" value={kit.id} />
                <BottoneConferma messaggio="Annullare la consegna del kit? I punti vengono tolti; le foto restano nei Documenti." className="btn-3d btn-3d-outline px-3 py-1 text-xs text-red-700">Annulla consegna</BottoneConferma>
              </form>
            )}
          </div>
        </div>
      ) : !puoConsegnareKit(stato) ? (
        <p className="text-sm text-neutral-600">A lavoro finito il commerciale consegna il kit P&amp;C al cliente e lo registra qui: vale <b>{regole.puntiConsegna} punti</b>, +{regole.puntiFoto} con la foto, +{regole.puntiRecensione} con la recensione.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-neutral-700">
            Il lavoro è finito: quando il kit è consegnato al cliente metti la spunta. I punti vanno al commerciale
            {persone.find((p) => p.id === commercialeId) ? <> (<b>{persone.find((p) => p.id === commercialeId)!.nome}</b>)</> : null}:
            {" "}<b>{puntiConsegna({ conFoto: false, recensione: false }, regole)} punti</b>, <b>+{regole.puntiFoto}</b> con la foto, <b>+{regole.puntiRecensione}</b> con la recensione.
          </p>
          <form action={registraKitCliente}>
            <input type="hidden" name="commessaId" value={commessaId} />
            <input type="hidden" name="utenteId" value={commercialeId} />
            <button className="btn-3d btn-3d-green px-4 py-2 text-sm">✅ Kit consegnato</button>
          </form>
          <details className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-800">📷 Con la foto, la recensione o un altro giorno</summary>
        <form action={registraKitCliente} className="mt-3 space-y-3">
          <input type="hidden" name="commessaId" value={commessaId} />
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-neutral-700">Chi l&apos;ha consegnato
              <select name="utenteId" defaultValue={commercialeId} className={`${inp} block`}>
                {persone.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-neutral-700">Giorno
              <input type="date" name="giorno" defaultValue={perInput(new Date()).slice(0, 10)} className={`${inp} block`} />
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <input type="checkbox" name="recensione" value="1" className="h-4 w-4" /> Ha già lasciato la recensione
            </label>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-neutral-700">📷 Foto della consegna con il cliente (facoltativa, +{regole.puntiFoto} punti)</p>
            <FotoRilievo name="foto" invio={{ url: "/api/documenti/carica", campi: { entita: "COMMESSA", entitaId: commessaId, cartella: "Consegna kit" } }} />
          </div>
          <input name="nota" placeholder="Nota (facoltativa)" className={`${inp} w-full`} />
          <button className="btn-3d btn-3d-pink px-4 py-2 text-sm">🎁 Registra la consegna del kit</button>
        </form>
          </details>
        </div>
      )}
    </section>
  );
}
