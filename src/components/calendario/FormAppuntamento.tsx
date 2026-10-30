import ClientePicker from "./ClientePicker";
import { creaAppuntamento, modificaAppuntamento } from "@/app/calendario-actions";
import { TIPI_APPUNTAMENTO } from "@/lib/calendario/eventi";

type Props = {
  utenti: { id: string; nome: string }[];
  utenteId: string;
  puoAssegnare: boolean;
  data: string; // "YYYY-MM-DDTHH:mm"
  cliente?: { id: string; nome: string; email?: string | null } | null;
  commessaId?: string | null;
  preventivoId?: string | null;
  ritorno?: string;
  // modifica
  esistente?: { id: string; tipo: string; durataMin: number; titolo: string | null; luogo: string | null; note: string | null; invitaCliente: boolean } | null;
  mailAttiva: boolean;
};

const inp = "w-full border border-neutral-300 rounded px-2 py-1.5 text-sm";
const lab = "text-[11px] font-bold text-neutral-700";

export default function FormAppuntamento(p: Props) {
  const e = p.esistente;
  return (
    <form action={e ? modificaAppuntamento : creaAppuntamento} className="grid grid-cols-1 md:grid-cols-6 gap-3">
      {e && <input type="hidden" name="id" value={e.id} />}
      {p.ritorno && <input type="hidden" name="ritorno" value={p.ritorno} />}
      {p.commessaId && <input type="hidden" name="commessaId" value={p.commessaId} />}
      {p.preventivoId && <input type="hidden" name="preventivoId" value={p.preventivoId} />}
      {!e && (
        <div className="md:col-span-3">
          <label className={lab}>Cliente *</label>
          {p.cliente ? (
            <>
              <input type="hidden" name="clienteId" value={p.cliente.id} />
              <p className="border border-green-500 bg-green-50 rounded px-2 py-1.5 text-sm font-semibold">{p.cliente.nome}</p>
            </>
          ) : (
            <ClientePicker />
          )}
        </div>
      )}
      <div className={e ? "md:col-span-2" : "md:col-span-3"}>
        <label className={lab}>Tipo</label>
        <select name="tipo" defaultValue={e?.tipo ?? "COMMERCIALE"} className={inp}>
          {TIPI_APPUNTAMENTO.map((t) => <option key={t.chiave} value={t.chiave}>{t.nome}</option>)}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className={lab}>Giorno e ora *</label>
        <input type="datetime-local" name="dataOra" defaultValue={p.data} step={900} required className={inp} />
      </div>
      <div className="md:col-span-1">
        <label className={lab}>Durata</label>
        <select name="durataMin" defaultValue={String(e?.durataMin ?? 60)} className={inp}>
          {[15, 30, 45, 60, 90, 120, 180, 240, 480].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} ${m === 60 ? "ora" : "ore"}`}</option>)}
        </select>
      </div>
      <div className={e ? "md:col-span-1" : "md:col-span-3"}>
        <label className={lab}>Con chi</label>
        {p.puoAssegnare ? (
          <select name="utenteId" defaultValue={p.utenteId} className={inp}>
            {p.utenti.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        ) : (
          <>
            <input type="hidden" name="utenteId" value={p.utenteId} />
            <p className="border border-neutral-200 bg-neutral-50 rounded px-2 py-1.5 text-sm">{p.utenti.find((u) => u.id === p.utenteId)?.nome ?? "io"}</p>
          </>
        )}
      </div>
      <div className="md:col-span-3">
        <label className={lab}>Titolo (facoltativo)</label>
        <input name="titolo" defaultValue={e?.titolo ?? ""} placeholder="es. Presentazione pergola bioclimatica" className={inp} />
      </div>
      <div className="md:col-span-3">
        <label className={lab}>Luogo (vuoto = indirizzo del cliente)</label>
        <input name="luogo" defaultValue={e?.luogo ?? ""} placeholder="indirizzo del cliente" className={inp} />
      </div>
      <div className="md:col-span-6">
        <label className={lab}>Note per chi va all&apos;appuntamento</label>
        <textarea name="note" defaultValue={e?.note ?? ""} rows={2} className={inp} placeholder="es. portare campionario colori, citofonare Rossi" />
      </div>
      <div className="md:col-span-6 flex flex-wrap items-center gap-4">
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" name="invitaCliente" defaultChecked={e?.invitaCliente ?? false} /> ✉ Manda la conferma anche al cliente
          {p.cliente && !p.cliente.email && <span className="text-[11px] text-amber-700">(cliente senza email)</span>}
        </label>
        <span className="text-[11px] text-neutral-600">
          {p.mailAttiva ? "📨 L'incaricato riceve l'invito sul calendario del telefono." : "📨 Gli inviti partiranno appena è attivo l'invio email."}
        </span>
        <button className="btn-3d btn-3d-green text-sm px-5 py-2 ml-auto">{e ? "💾 Salva modifiche" : "📅 Fissa appuntamento"}</button>
      </div>
    </form>
  );
}
