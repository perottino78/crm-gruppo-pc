// Riquadro "La mia casella email" (Profilo) e la versione compatta per l'amministratore (Impostazioni › Utenti).
// Componente server: la password non torna mai nella pagina, si vede solo se la casella è collegata.
import type { Utente } from "@prisma/client";
import { collegaMiaCasella, scollegaMiaCasella, adminCollegaCasella } from "@/app/posta-actions";
import { HOST_PREDEFINITO, PORTA_PREDEFINITA } from "@/lib/mail/caselle";

type U = Pick<Utente, "id" | "email" | "smtpUtente" | "smtpPassword" | "smtpHost" | "smtpPorta" | "smtpVerificataIl" | "smtpErrore">;
type Aziendale = { host: string; porta: number; utente: string } | null;
const inp = "w-full border border-neutral-300 rounded-md px-3 py-2 text-sm";

export function statoCasella(u: U) {
  if (!u.smtpPassword) return { testo: "non collegata", classe: "bg-neutral-100 text-neutral-600" };
  if (u.smtpErrore) return { testo: `non funziona: ${u.smtpErrore}`, classe: "bg-red-50 text-red-700" };
  if (u.smtpVerificataIl) return { testo: `collegata ✓ (provata il ${u.smtpVerificataIl.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })})`, classe: "bg-emerald-50 text-emerald-700" };
  return { testo: "da provare", classe: "bg-amber-50 text-amber-800" };
}

export default function CasellaEmail({ utente: u, aziendale, messaggio, errore }: { utente: U; aziendale: Aziendale; messaggio?: string; errore?: string }) {
  const s = statoCasella(u);
  return (
    <div id="posta" className="bg-white rounded-lg border border-neutral-200 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-neutral-900">✉️ La mia casella email</h2>
        <span className={`text-xs px-2 py-1 rounded-full ${s.classe}`}>{s.testo}</span>
      </div>
      <p className="text-sm text-neutral-600">
        Collega la tua email aziendale: le email che il CRM manda ai clienti a tuo nome (inviti agli appuntamenti, email delle
        pratiche) partiranno dalla tua casella e le risposte arriveranno a te. Se non la colleghi partono dalla casella aziendale
        {aziendale ? ` (${aziendale.utente})` : ""}, sempre con &quot;rispondi a&quot; il tuo indirizzo.
      </p>
      {messaggio && <p className="text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">✅ {messaggio}</p>}
      {errore && <p className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{errore}</p>}
      <form action={collegaMiaCasella} className="flex flex-col gap-3">
        <label className="text-sm font-bold text-neutral-900">La tua email
          <input name="smtpUtente" type="email" defaultValue={u.smtpUtente ?? u.email} className={`${inp} font-normal mt-1`} />
        </label>
        <label className="text-sm font-bold text-neutral-900">Password della tua email
          <input name="password" type="password" autoComplete="new-password" placeholder={u.smtpPassword ? "•••••••• (lascia vuoto per non cambiarla)" : "la stessa che usi per leggere la posta"} className={`${inp} font-normal mt-1`} />
        </label>
        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-600">Impostazioni avanzate (di solito non servono)</summary>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <label className="col-span-2 text-xs text-neutral-600">Server di posta in uscita (SMTP)
              <input name="smtpHost" defaultValue={u.smtpHost ?? ""} placeholder={aziendale?.host ?? HOST_PREDEFINITO} className={inp} />
            </label>
            <label className="text-xs text-neutral-600">Porta
              <input name="smtpPorta" inputMode="numeric" defaultValue={u.smtpPorta ?? ""} placeholder={String(aziendale?.porta ?? PORTA_PREDEFINITA)} className={inp} />
            </label>
          </div>
        </details>
        <div className="flex flex-wrap gap-2">
          <button className="btn-3d btn-3d-teal text-sm px-4 py-2">{u.smtpPassword ? "Salva e riprova" : "Collega e manda una prova"}</button>
        </div>
      </form>
      {u.smtpPassword && <form action={scollegaMiaCasella}><button className="text-sm text-red-700 underline">Scollega la mia casella</button></form>}
      <p className="text-xs text-neutral-500">La password viene salvata cifrata e serve solo per spedire. Se cambi la password della tua email, aggiornala anche qui.</p>
    </div>
  );
}

/** Versione compatta per l'amministratore, nella lista utenti. */
export function CasellaEmailAdmin({ utente: u }: { utente: U }) {
  const s = statoCasella(u);
  return (
    <form action={adminCollegaCasella} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="utenteId" value={u.id} />
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-neutral-600">Casella email <span className={`ml-1 px-1.5 rounded ${s.classe}`}>{s.testo}</span></label>
        <input name="smtpUtente" defaultValue={u.smtpUtente ?? u.email} className="border border-neutral-200 rounded px-2 py-1 text-xs w-56" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-neutral-600">Password email</label>
        <input name="password" type="password" autoComplete="new-password" placeholder={u.smtpPassword ? "•••• (invariata)" : ""} className="border border-neutral-200 rounded px-2 py-1 text-xs w-40" />
      </div>
      <button className="btn-3d btn-3d-outline text-[11px] px-3 py-1.5">Collega e prova</button>
    </form>
  );
}
