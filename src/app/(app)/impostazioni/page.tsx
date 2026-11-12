export const dynamic = "force-dynamic";

import { puo } from "@/lib/permessi/catalogo";
import { prisma } from "@/lib/prisma";
import { aggiornaConfigurazione, creaUtente, adminResetPassword, adminAggiornaTelefonoUtente, aggiornaSolarisRuolo } from "@/app/actions";
import Link from "next/link";
import { BRANDS } from "@/lib/brands";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { cambiaMansioneUtente, impostaStatoUtente, salvaCalendarioUtente } from "@/app/team-actions";
import { coloriPersone } from "@/lib/calendario/eventi";
import { salvaDestinatarioAssistenza } from "@/app/segnalazioni-actions";
import { destinatarioAssistenza, CHIAVE_DESTINATARIO } from "@/lib/segnalazioni/server";
import { UFFICI, nomeUfficio } from "@/lib/flusso";
import { CasellaEmailAdmin } from "@/components/CasellaEmail";
import { statoUtente, RUOLI_UTENTE, STATI_UTENTE, puoMarketing, RUOLI_CREABILI_MARKETING } from "@/lib/utenti/stato";

const RUOLI = ["COMMERCIALE", "TELEFONISTA", "MARKETING", "TECNICO", "POSATORE", "AMMINISTRATIVO", "AMMINISTRATORE"];

export default async function ImpostazioniPage({ searchParams }: { searchParams: Promise<{ utente?: string; posta?: string; postaErrore?: string; ok?: string; errore?: string }> }) {
  const sp = await searchParams;
  const utenteCorrente = await getCurrentUser();
  const admin = isAmministratore(utenteCorrente);
  // il marketing vede il team e aggiunge colleghi (non amministratori); ruoli, password e stati restano all'amministratore
  const marketing = !admin && puo(utenteCorrente, "utenti.crea");

  const [config, utenti, brands] = await Promise.all([
    // la posta aziendale ha il suo riquadro (Email automatiche): la password non deve comparire qui
    prisma.configurazione.findMany({ where: { AND: [{ NOT: { chiave: { startsWith: "posta_" } } }, { NOT: { chiave: { startsWith: "email_testo:" } } }, { NOT: { chiave: { startsWith: "rimbalzi_" } } }, { NOT: { chiave: { startsWith: "assistenza_" } } }] }, orderBy: { chiave: "asc" } }),
    admin || marketing ? prisma.utente.findMany({ orderBy: { nome: "asc" } }) : Promise.resolve([]),
    prisma.brand.findMany({ orderBy: { nome: "asc" } }),
  ]);

  // il team attivo (e in pausa) in elenco; i disattivati a parte, in fondo
  const attivi = utenti.filter((u) => u.stato !== "DISATTIVATO");
  const disattivati = utenti.filter((u) => u.stato === "DISATTIVATO");
  // assistenza interna: chi riceve le segnalazioni del team
  const destAssistenza = admin ? await destinatarioAssistenza() : null;
  const sceltoAssistenza = admin ? (await prisma.configurazione.findUnique({ where: { chiave: CHIAVE_DESTINATARIO } }))?.valore ?? "" : "";
  // colori del calendario come li vede il calendario (scelto o automatico)
  const coloriCal = coloriPersone(utenti.filter((u) => u.stato === "ATTIVO" && u.inCalendario).map((u) => ({ id: u.id, colore: u.coloreCalendario })));

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Impostazioni</h1>

      <h2 className="text-base font-bold text-neutral-900 mb-3">Configurazione listino e IVA</h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-8">
        {config.map((c) => (
          <form
            key={c.id}
            action={aggiornaConfigurazione}
            className="flex items-center justify-between px-4 py-3 text-sm gap-3"
          >
            <input type="hidden" name="id" value={c.id} />
            <span className="text-neutral-700">{c.chiave}</span>
            <div className="flex items-center gap-2">
              <input
                name="valore"
                defaultValue={c.valore}
                className="border border-neutral-200 rounded px-2 py-1 text-sm w-28 text-right"
              />
              <button className="text-xs text-blue-600 underline">salva</button>
            </div>
          </form>
        ))}
      </div>

      {admin && (
        <section id="assistenza" className="mb-8 rounded-lg border border-red-200 bg-white px-4 py-3">
          <h2 className="text-base font-bold text-neutral-900">🆘 Assistenza del team</h2>
          <p className="mb-2 text-xs text-neutral-600">Chi riceve le segnalazioni del pulsante «🆘 Segnala un problema» (in basso nel menu). Gli amministratori sono sempre in copia e le vedono in «📥 Segnalazioni del team».</p>
          <form action={salvaDestinatarioAssistenza} className="flex flex-wrap items-end gap-2">
            <select name="utenteId" defaultValue={sceltoAssistenza} className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
              <option value="">Automatico: responsabile del Marketing ({destAssistenza && !sceltoAssistenza ? destAssistenza.nome : "o un amministratore"})</option>
              {utenti.filter((x) => x.stato === "ATTIVO").map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
            <button className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">Salva</button>
            {destAssistenza && <span className="text-xs text-neutral-600">Ora le riceve: <b>{destAssistenza.nome}</b></span>}
          </form>
        </section>
      )}

      <Link href="/impostazioni/anagrafica" className="block bg-white rounded-lg border border-neutral-200 px-4 py-3 mb-8 hover:border-neutral-400">
        <span className="text-base font-bold text-neutral-900">Anagrafica fornitori, posatori e tecnici →</span>
        <span className="block text-xs text-neutral-600">Dati fiscali, banca e pagamenti, mail ordini, tariffe di posa, DURC e assicurazioni.</span>
      </Link>

      {(admin || puo(utenteCorrente, "firme") || puo(utenteCorrente, "marketing")) && (
        <Link href="/impostazioni/firme" className="block bg-white rounded-lg border border-neutral-200 px-4 py-3 mb-8 hover:border-neutral-400">
          <span className="text-base font-bold text-neutral-900">✍️ Firme email del team →</span>
          <span className="block text-xs text-neutral-600">La firma di ognuno (nome, ruolo, telefono, sito) in fondo alle email del CRM, come «Invia offerta».</span>
        </Link>
      )}

      {admin && (
        <div className="mb-8 grid gap-3 md:grid-cols-2">
          <Link href="/impostazioni/ruoli" className="block bg-white rounded-lg border border-neutral-200 px-4 py-3 hover:border-neutral-400">
            <span className="text-base font-bold text-neutral-900">🔐 Ruoli e permessi →</span>
            <span className="block text-xs text-neutral-600">Profili come in BConsole: cosa può vedere e fare ognuno (a spunta) e quali dati (suoi, zona, tutto).</span>
          </Link>
          <Link href="/impostazioni/zone" className="block bg-white rounded-lg border border-neutral-200 px-4 py-3 hover:border-neutral-400">
            <span className="text-base font-bold text-neutral-900">🗺️ Zone commerciali →</span>
            <span className="block text-xs text-neutral-600">Piemonte, Liguria, Valle d&apos;Aosta, Lombardia e altre: regioni e responsabile commerciale di zona.</span>
          </Link>
        </div>
      )}

      <Link href="/impostazioni/lead" className="block bg-white rounded-lg border border-neutral-200 px-4 py-3 mb-8 hover:border-neutral-400">
        <span className="text-base font-bold text-neutral-900">📘 Lead da pubblicità: moduli istantanei di Meta e collegamenti →</span>
        <span className="block text-xs text-neutral-600">Collega i moduli di Facebook e Instagram, link per le inserzioni, gestionale pubblicità, telefoniste per marchio.</span>
      </Link>

      <Link href="/impostazioni/automazioni" className="block bg-white rounded-lg border border-neutral-200 px-4 py-3 mb-4 hover:border-neutral-400">
        <span className="text-base font-bold text-neutral-900">✉️ Email automatiche dei lead (ex Keap) →</span>
        <span className="block text-xs text-neutral-600">Accensione/pausa, stato della posta, registro delle email, anteprima dei testi dei percorsi.</span>
      </Link>

      <Link href="/impostazioni/flusso" className="block bg-white rounded-lg border border-neutral-200 px-4 py-3 mb-8 hover:border-neutral-400">
        <span className="text-base font-bold text-neutral-900">Flusso pratiche fra uffici: task ed email →</span>
        <span className="block text-xs text-neutral-600">Per ogni fase: ufficio, fase successiva, testo del task e email con testo personalizzabile.</span>
      </Link>

      <h2 className="text-base font-bold text-neutral-900 mb-3">Brand attivi</h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-8">
        {brands.map((b) => {
          const c = BRANDS.find((x) => x.nome === b.nome);
          return (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              {c?.logoUrl ? (
                <img src={c.logoUrl} alt={b.nome} className="h-8 w-auto object-contain" />
              ) : (
                <span className="w-4 h-4 rounded-full inline-block" style={{ background: c?.primary ?? "#999" }} />
              )}
              <span className="font-medium">{b.nome}</span>
            </div>
          );
        })}
      </div>

      <h2 className="text-base font-bold text-neutral-900 mb-1">Utenti, ruoli e credenziali</h2>
      {admin && <p className="text-sm text-neutral-600 mb-3">Clicca sul nome della persona per aprire la sua scheda: accesso, ruolo, ufficio, email, stato. I disattivati sono in fondo: tornano nell&apos;elenco solo se li riattivi.</p>}

      {(sp.ok || sp.errore) && !sp.utente && (
        <p className={`mb-3 rounded-lg border px-3 py-2 text-sm font-semibold ${sp.errore ? "border-red-300 bg-red-50 text-red-800" : "border-green-300 bg-green-50 text-green-800"}`}>{sp.errore ?? sp.ok}</p>
      )}
      {!admin && !marketing ? (
        <div className="bg-white rounded-lg border border-neutral-200 p-4 text-sm font-medium text-neutral-600">
          Sezione riservata all&apos;amministratore. Per un reset della password o dello username,
          contatta chi gestisce il CRM.
        </div>
      ) : marketing ? (
        <>
          <p className="text-sm text-neutral-600 mb-3">Il team del CRM. Puoi aggiungere nuovi colleghi; ruoli, password e disattivazioni li gestisce l&apos;amministratore.</p>
          <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-4">
            {attivi.map((u) => (
              <div key={u.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span><b className="text-neutral-900">{u.nome}</b> <span className="text-xs text-neutral-500">{u.email}{u.ufficio ? ` · ${nomeUfficio(u.ufficio)}` : ""}</span></span>
                <span className="flex gap-1 items-center">
                  {u.smtpPassword && !u.smtpErrore ? <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">✉️ ✓ email attiva</span> : <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-500">✉️ non collegata</span>}
                  {u.stato !== "ATTIVO" && <span className={`text-xs px-2 py-1 rounded-full ${statoUtente(u.stato).classe}`}>{statoUtente(u.stato).nome}</span>}
                  <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600">{u.ruolo}</span>
                </span>
              </div>
            ))}
          </div>
          <form action={creaUtente} className="bg-white rounded-lg border border-neutral-200 p-4 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1"><label className="text-xs text-neutral-700">Nome</label><input name="nome" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm" /></div>
            <div className="flex flex-col gap-1"><label className="text-xs text-neutral-700">Email</label><input name="email" type="email" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm" /></div>
            <div className="flex flex-col gap-1"><label className="text-xs text-neutral-700">Username (opz.)</label><input name="username" placeholder="lascia vuoto per usare l'email" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" /></div>
            <div className="flex flex-col gap-1"><label className="text-xs text-neutral-700">Password iniziale (opz.)</label><input name="password" placeholder="min. 6 caratteri" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" /></div>
            <div className="flex flex-col gap-1"><label className="text-xs text-neutral-700">Ruolo</label>
              <select name="ruolo" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm">{RUOLI_CREABILI_MARKETING.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
            <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Aggiungi utente</button>
          </form>
        </>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-4">
            {attivi.map((u) => (
              <details key={u.id} id={`utente-${u.id}`} open={sp.utente === u.id} className="group text-sm">
                <summary className="px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer list-none hover:bg-neutral-50">
                  <span className="flex items-center gap-2">
                    <span className="text-neutral-400 group-open:rotate-90 transition-transform">▶</span>
                    <span className="h-3 w-3 shrink-0 rounded-full border border-neutral-300" style={{ background: u.inCalendario ? coloriCal.get(u.id)?.colore ?? "#d4d4d4" : "transparent" }} title={u.inCalendario ? "colore nel calendario" : "non compare nel calendario"} />
                    <span className="text-blue-700 font-semibold">{u.nome}</span>
                    <span className="text-xs text-neutral-500 hidden sm:inline">{u.email}</span>
                  </span>
                  <span className="flex gap-1 shrink-0 items-center">
                    {/* casella email: verde se collegata e funzionante, rossa se dà errore, grigia se non collegata */}
                    {u.smtpPassword && !u.smtpErrore ? <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-800" title={u.smtpVerificataIl ? `provata il ${u.smtpVerificataIl.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}` : undefined}>✉️ ✓ email attiva</span>
                      : u.smtpPassword ? <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700" title={u.smtpErrore ?? undefined}>✉️ ✗ non funziona</span>
                      : <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-500">✉️ non collegata</span>}
                    {u.stato !== "ATTIVO" && <span className={`text-xs px-2 py-1 rounded-full ${statoUtente(u.stato).classe}`}>{statoUtente(u.stato).nome}</span>}
                    <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600">{u.ruolo}</span>
                  </span>
                </summary>
                <div className="px-4 pb-4 pt-1 flex flex-col gap-2 bg-neutral-50/50">
                <p className="text-xs text-neutral-600">
                  {u.email}
                  {u.username && <span> · username: <span className="font-mono">{u.username}</span></span>}
                  {!u.username && <span className="text-amber-700"> · nessun accesso attivato</span>}
                  {u.telefono && <span> · tel. {u.telefono}</span>}
                  {" · "}<Link href={`/commerciali/${u.id}#gestione`} className="underline">scheda completa (passa il lavoro, elimina)</Link>
                </p>
                <form action={impostaStatoUtente} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="utenteId" value={u.id} />
                  <input type="hidden" name="ritorno" value={`/impostazioni?utente=${u.id}`} />
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-neutral-600">Stato</label>
                    <select name="stato" defaultValue={u.stato} disabled={u.id === utenteCorrente?.id} className="border border-neutral-200 rounded px-2 py-1 text-xs w-36">
                      {STATI_UTENTE.map((x) => <option key={x.chiave} value={x.chiave}>{x.nome}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-neutral-600">Nota (facoltativa)</label>
                    <input name="nota" defaultValue={u.statoNota ?? ""} placeholder="es. maternità fino a marzo" className="border border-neutral-200 rounded px-2 py-1 text-xs w-64" />
                  </div>
                  <button disabled={u.id === utenteCorrente?.id} className="btn-3d btn-3d-outline text-[11px] px-3 py-1.5 disabled:opacity-50">Salva stato</button>
                </form>
                <form action={salvaCalendarioUtente} className="flex flex-wrap items-end gap-3 pt-1 border-t border-neutral-50">
                  <input type="hidden" name="utenteId" value={u.id} />
                  <input type="hidden" name="ritorno" value={`/impostazioni?utente=${u.id}`} />
                  <span className="text-[11px] font-semibold text-neutral-700 self-center">📅 Calendario</span>
                  <label className="flex items-center gap-1.5 text-xs self-center cursor-pointer">
                    <input type="checkbox" name="inCalendario" value="1" defaultChecked={u.inCalendario} className="h-4 w-4" /> calendario attivo
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-neutral-600">
                    Colore{u.coloreCalendario ? "" : " (ora automatico)"}
                    <input type="color" name="colore" defaultValue={coloriCal.get(u.id)?.colore ?? u.coloreCalendario ?? "#2a78d6"} className="h-8 w-16 cursor-pointer rounded border border-neutral-200 bg-white" aria-label={`Colore di ${u.nome} nel calendario`} />
                  </label>
                  <button className="btn-3d btn-3d-outline text-[11px] px-3 py-1.5">Salva calendario</button>
                  {u.coloreCalendario && <button name="automatico" value="1" className="text-[11px] text-neutral-600 underline">torna al colore automatico</button>}
                </form>
                <form action={adminResetPassword} className="flex flex-wrap items-end gap-2 pt-1 border-t border-neutral-50">
                  <input type="hidden" name="utenteId" value={u.id} />
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-neutral-600">Nuovo username</label>
                    <input
                      name="nuovoUsername"
                      placeholder={u.username ?? u.email}
                      className="border border-neutral-200 rounded px-2 py-1 text-xs w-40"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-neutral-600">Nuova password</label>
                    <input
                      name="nuovaPassword"
                      type="text"
                      placeholder="min. 6 caratteri"
                      className="border border-neutral-200 rounded px-2 py-1 text-xs w-40"
                    />
                  </div>
                  <button className="btn-3d btn-3d-outline text-[11px] px-3 py-1.5">Reset accesso</button>
                </form>
                <form action={cambiaMansioneUtente} id={`mansione-${u.id}`} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="utenteId" value={u.id} />
                  <input type="hidden" name="ritorno" value={`/impostazioni?utente=${u.id}`} />
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-neutral-600">Ruolo</label>
                    <select name="ruolo" defaultValue={u.ruolo} className="border border-neutral-200 rounded px-2 py-1 text-xs w-36">
                      {RUOLI_UTENTE.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-neutral-600">Ufficio (per i task di pratica)</label>
                    <select name="ufficio" defaultValue={u.ufficio ?? "__nessuno__"} className="border border-neutral-200 rounded px-2 py-1 text-xs w-44">
                      <option value="__nessuno__">— nessuno —</option>
                      {UFFICI.map((x) => <option key={x.chiave} value={x.chiave}>{x.nome}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-neutral-600">Email di lavoro</label>
                    <input name="email" type="email" required defaultValue={u.email} className="border border-neutral-200 rounded px-2 py-1 text-xs w-56" />
                  </div>
                  <button className="btn-3d btn-3d-outline text-[11px] px-3 py-1.5">Salva mansione ed email</button>
                </form>
                {sp.utente === u.id && sp.ok && <p className="text-xs text-emerald-700">✅ {sp.ok}</p>}
                {sp.utente === u.id && sp.errore && <p className="text-xs text-red-700">{sp.errore}</p>}
                <form action={adminAggiornaTelefonoUtente} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="utenteId" value={u.id} />
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-neutral-600">Telefono (per la stampa offerte)</label>
                    <input
                      name="telefono"
                      defaultValue={u.telefono ?? ""}
                      placeholder="es. 011 1234567"
                      className="border border-neutral-200 rounded px-2 py-1 text-xs w-40"
                    />
                  </div>
                  <button className="btn-3d btn-3d-outline text-[11px] px-3 py-1.5">Salva telefono</button>
                </form>
                <div id={sp.utente === u.id ? "posta" : undefined}>
                  <CasellaEmailAdmin utente={u} />
                  {sp.utente === u.id && sp.posta && <p className="text-xs text-emerald-700 mt-1">✅ {sp.posta}</p>}
                  {sp.utente === u.id && sp.postaErrore && <p className="text-xs text-red-700 mt-1">{sp.postaErrore}</p>}
                </div>
                <form action={aggiornaSolarisRuolo} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="utenteId" value={u.id} />
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-neutral-600">Accesso Solaris Studio</label>
                    <select name="solarisRuolo" defaultValue={u.solarisRuolo ?? ""} className="border border-neutral-200 rounded px-2 py-1 text-xs w-44">
                      <option value="">— nessun accesso —</option>
                      <option value="COMMERCIALE">COMMERCIALE (propri clienti, no costi)</option>
                      <option value="TECNICO">TECNICO (tutti i progetti, sola lettura)</option>
                    </select>
                  </div>
                  <button className="btn-3d btn-3d-outline text-[11px] px-3 py-1.5">Salva Solaris</button>
                </form>
                </div>
              </details>
            ))}
          </div>

          {disattivati.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-neutral-700 mb-1">Disattivati ({disattivati.length})</h3>
              <p className="text-xs text-neutral-500 mb-2">Non entrano nel CRM e non compaiono nelle assegnazioni; i loro dati restano. Con &quot;Riattiva&quot; tornano nell&apos;elenco del team.</p>
              <div className="bg-neutral-50 rounded-lg border border-neutral-200 divide-y divide-neutral-100">
                {disattivati.map((u) => (
                  <form key={u.id} action={impostaStatoUtente} className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <input type="hidden" name="utenteId" value={u.id} />
                    <input type="hidden" name="stato" value="ATTIVO" />
                    <input type="hidden" name="ritorno" value={`/impostazioni?utente=${u.id}`} />
                    <span className="text-neutral-600">
                      <b className="text-neutral-800">{u.nome}</b> · {u.ruolo} · {u.email}
                      <span className="text-xs text-neutral-500">{u.statoDal ? ` · disattivato il ${u.statoDal.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}` : ""}{u.statoNota ? ` · ${u.statoNota}` : ""}</span>
                    </span>
                    <button className="btn-3d btn-3d-green text-[11px] px-3 py-1.5">Riattiva</button>
                  </form>
                ))}
              </div>
            </div>
          )}

          <form action={creaUtente} className="bg-white rounded-lg border border-neutral-200 p-4 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Nome</label>
              <input name="nome" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Email</label>
              <input name="email" type="email" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Username (opz.)</label>
              <input name="username" placeholder="lascia vuoto per usare l'email" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Password iniziale (opz.)</label>
              <input name="password" placeholder="min. 6 caratteri" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-700">Ruolo</label>
              <select name="ruolo" required className="border border-neutral-200 rounded px-2 py-1.5 text-sm">
                {RUOLI.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <button className="btn-3d btn-3d-blue text-sm px-4 py-2">Aggiungi utente</button>
          </form>
        </>
      )}
    </div>
  );
}
