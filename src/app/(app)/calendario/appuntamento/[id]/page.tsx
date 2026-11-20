export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { mailConfigurata } from "@/lib/mail/invio";
import { nomeTipoAppuntamento, vedeTutti, STILE_TIPO } from "@/lib/calendario/eventi";
import { perInput, chiaveGiorno, giornoBreve, oraRoma } from "@/lib/calendario/tempo";
import { esitoAppuntamento, reinviaInvito, spostaAppuntamentoRapido, spostaAppuntamentoA, rifissaDalCentralino, collegaAppuntamentoProgetto, aggiornaIndirizzoAppuntamento, rilievoEseguito } from "@/app/calendario-actions";
import { numeroCommessa, STATI_COMMESSA } from "@/lib/commesse";
import { STATI_PROGETTO_CHIUSO, linkProgetto } from "@/lib/calendario/rilievo-progetto";
import Documenti from "@/components/documenti/Documenti";
import { puoVedereEntita } from "@/lib/documenti/server";
import { linkOfferta } from "@/lib/mail/link-offerta";
import { telefonistaDefaultPerBrand } from "@/lib/leadIngest";
import { aggiungiGiorni } from "@/lib/calendario/tempo";
import FormAppuntamento from "@/components/calendario/FormAppuntamento";
import RisposteModulo from "@/components/lead/RisposteModulo";
import { leggiNoteLead } from "@/lib/automazioni/note-lead";

const STATI: Record<string, string> = { PROGRAMMATO: "bg-blue-100 text-blue-900", CONFERMATO: "bg-green-100 text-green-900", COMPLETATO: "bg-neutral-200 text-neutral-800", ANNULLATO: "bg-red-100 text-red-900" };

export default async function AppuntamentoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; modifica?: string }> }) {
  const { id } = await params;
  const { msg, modifica } = await searchParams;
  const u = await getCurrentUser();
  if (!u) return null;
  const a = await prisma.appuntamento.findUnique({ where: { id }, include: { cliente: true, utente: true } });
  if (!a) notFound();
  const tutti = vedeTutti(u);
  if (!tutti && a.utenteId !== u.id) notFound();
  const utenti = await prisma.utente.findMany({ where: { OR: [{ stato: "ATTIVO" }, { id: a.utenteId }] }, select: { id: true, nome: true }, orderBy: { nome: "asc" } });
  const luogo = a.luogo || [a.cliente.indirizzo, [a.cliente.cap, a.cliente.comune].filter(Boolean).join(" "), a.cliente.provincia].filter(Boolean).join(", ");
  const tel = a.cliente.telefono;
  const mappa = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(luogo)}`;
  const fine = new Date(a.dataOra.getTime() + a.durataMin * 60_000);
  const noteLette = leggiNoteLead(a.note);
  const idTel = await telefonistaDefaultPerBrand(a.cliente.brandId);
  const telefonista = idTel ? (await prisma.utente.findUnique({ where: { id: idTel }, select: { nome: true } }))?.nome.split(" ")[0] ?? null : null;
  const richiamaDefault = `${aggiungiGiorni(chiaveGiorno(new Date()), 1)}T10:00`;
  const rilievo = a.tipo === "SOPRALLUOGO";
  // progetti (pratiche) del cliente: quello collegato e quelli aperti a cui collegare l'appuntamento
  const progetti = await prisma.commessa.findMany({
    where: { clienteId: a.clienteId, OR: [{ stato: { notIn: STATI_PROGETTO_CHIUSO } }, ...(a.commessaId ? [{ id: a.commessaId }] : [])] },
    select: { id: true, numero: true, anno: true, stato: true, preventivoId: true, preventivo: { select: { oggetto: true } } },
    orderBy: [{ anno: "desc" }, { numero: "desc" }],
  });
  const collegato = progetti.find((p) => p.id === a.commessaId) ?? null;
  const nomeProgetto = (p: (typeof progetti)[number]) => `${numeroCommessa(p)}${p.preventivo?.oggetto ? ` — ${p.preventivo.oggetto}` : ""} (${STATI_COMMESSA[p.stato]?.label ?? p.stato.toLowerCase()})`;
  // contratto da vedere prima del rilievo (richiesta di Ugo 20/11/2026): l'offerta firmata del progetto collegato (o dei progetti aperti)
  // e i file della cartella «Contratto firmato»; tutto si apre a parte, in un'altra scheda
  const daRilevare = rilievo ? (collegato ? [collegato] : progetti) : [];
  const fileContratto = daRilevare.length ? await prisma.documento.findMany({
    where: { cartella: "Contratto firmato", OR: [{ entita: "COMMESSA", entitaId: { in: daRilevare.map((p) => p.id) } }, { entita: "PREVENTIVO", entitaId: { in: daRilevare.map((p) => p.preventivoId) } }] },
    select: { id: true, nome: true, entita: true, entitaId: true }, orderBy: { createdAt: "asc" },
  }) : [];
  const fileVisibili = [];
  for (const d of fileContratto) if (await puoVedereEntita(u, d.entita, d.entitaId)) fileVisibili.push(d);
  const chiuso = a.stato === "COMPLETATO" || a.stato === "ANNULLATO";
  const ritorno = `/calendario/appuntamento/${a.id}`;
  const btnStato = (stato: string, testo: string, cls: string) => (
    <form action={esitoAppuntamento}>
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="stato" value={stato} />
      <input type="hidden" name="ritorno" value={ritorno} />
      <button className={`btn-3d ${cls} text-sm px-4 py-2`}>{testo}</button>
    </form>
  );

  return (
    <div className="max-w-4xl">
      <Link href={`/calendario?giorno=${chiaveGiorno(a.dataOra)}`} className="btn-indietro">← Calendario</Link>
      {msg && <p className="mt-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-900">{msg}</p>}

      <div className="mt-2 rounded-2xl border-2 bg-white overflow-hidden" style={{ borderColor: STILE_TIPO.APPUNTAMENTO.colore }}>
        <div className="px-5 py-4 flex flex-wrap items-start gap-4">
          <div className="rounded-xl bg-blue-600 text-white text-center px-4 py-2 shrink-0">
            <p className="text-[11px] uppercase font-bold">{giornoBreve(chiaveGiorno(a.dataOra)).split(" ")[0]}</p>
            <p className="text-3xl font-black leading-none">{+chiaveGiorno(a.dataOra).slice(8)}</p>
            <p className="text-xs font-bold">{oraRoma(a.dataOra)}–{oraRoma(fine)}</p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black text-neutral-900">{a.titolo || nomeTipoAppuntamento(a.tipo)}</h1>
              {rilievo && <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-900 border border-violet-300">📏 RILIEVO · inserito da {a.creatoDaNome ?? "—"}</span>}
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATI[a.stato] ?? "bg-neutral-100"}`}>{a.stato.toLowerCase()}</span>
            </div>
            <p className="text-sm text-neutral-700 mt-0.5">
              {nomeTipoAppuntamento(a.tipo)} con <Link href={`/clienti/${a.clienteId}`} className="font-bold text-blue-800 hover:underline">{a.cliente.nome}</Link> · incaricato <b>{a.utente.nome}</b>
            </p>
            {a.note && (noteLette.risposte.length > 0 || noteLette.noteDatate.length > 0
              ? <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
                  <p className="mb-2 text-xs font-bold text-sky-900">ℹ️ Da sapere prima di andare (solo da leggere): cosa ha chiesto il cliente e cosa ha annotato il centralino</p>
                  <RisposteModulo note={a.note} />
                </div>
              : <p className="text-sm text-neutral-800 mt-1 whitespace-pre-line">📝 {a.note}</p>)}
            <p className="text-[11px] text-neutral-500 mt-1">
              Fissato da {a.creatoDaNome ?? "—"} · {a.invitoInviatoIl ? `invito inviato il ${a.invitoInviatoIl.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" })}` : "invito non ancora inviato"}
              {a.invitaCliente ? " · conferma anche al cliente" : ""}
            </p>
          </div>
        </div>
        <div className="px-5 pb-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
          {tel ? <a href={`tel:${tel}`} className="btn-3d tile-3d btn-3d-dark"><span className="text-xl">📞</span><span>Chiama</span></a> : <span className="btn-3d tile-3d btn-3d-outline opacity-40"><span className="text-xl">📞</span><span>Chiama</span></span>}
          {luogo ? <a href={mappa} target="_blank" rel="noopener" className="btn-3d tile-3d btn-3d-orange"><span className="text-xl">📍</span><span>Naviga</span></a> : <span className="btn-3d tile-3d btn-3d-outline opacity-40"><span className="text-xl">📍</span><span>Naviga</span></span>}
          <Link href={`/clienti/${a.clienteId}`} className="btn-3d tile-3d btn-3d-blue"><span className="text-xl">👤</span><span>Scheda cliente</span></Link>
          <Link href={`/clienti/${a.clienteId}#nuova-offerta`} className="btn-3d tile-3d btn-3d-green"><span className="text-xl">➕</span><span>Nuova offerta</span></Link>
          <form action={reinviaInvito} className="contents">
            <input type="hidden" name="chiave" value={`APPUNTAMENTO:${a.id}`} />
            <input type="hidden" name="ritorno" value={ritorno} />
            <button className="btn-3d tile-3d btn-3d-purple"><span className="text-xl">📨</span><span>Rimanda invito</span></button>
          </form>
          <Link href={modifica ? ritorno : `${ritorno}?modifica=1#modifica`} scroll={!modifica} className="btn-3d tile-3d btn-3d-outline"><span className="text-xl">✎</span><span>{modifica ? "Chiudi modifica" : "Modifica"}</span></Link>
        </div>
        {/* dove andare: indirizzo ben visibile, «Portami» apre Google Maps, correggibile da chi va (richiesta di Ugo 20/11/2026) */}
        <div className="mx-5 mb-3 rounded-xl border-2 border-orange-300 bg-orange-50 p-3">
          <p className="text-[11px] font-bold uppercase text-orange-900">📍 Dove andare</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-base font-bold text-neutral-900">{luogo || <span className="font-normal text-red-700">Indirizzo mancante: scrivilo qui sotto</span>}</p>
            {luogo && <a href={mappa} target="_blank" rel="noopener" className="btn-3d btn-3d-orange px-4 py-2 text-sm">🧭 Portami</a>}
          </div>
          <details className="mt-2" open={!luogo}>
            <summary className="cursor-pointer text-xs font-bold text-orange-900">✏️ Correggi l&apos;indirizzo</summary>
            <form action={aggiornaIndirizzoAppuntamento} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={a.id} /><input type="hidden" name="ritorno" value={ritorno} />
              <input name="luogo" defaultValue={luogo} placeholder="Via, numero civico, comune" className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm" />
              <button className="btn-3d btn-3d-blue px-4 py-2 text-sm">💾 Salva</button>
            </form>
            <p className="mt-1 text-[11px] text-neutral-600">Vale solo per questo appuntamento{a.commessaId && rilievo ? " e per il rilievo della pratica" : ""}; lascia vuoto per tornare all&apos;indirizzo della scheda cliente.</p>
          </details>
        </div>
        {(tel || a.cliente.email) && (
          <p className="flex flex-wrap gap-x-4 px-5 pb-4 text-sm text-neutral-700">
            {tel && <a href={`tel:${tel}`} className="hover:underline">📞 {tel}</a>}
            {a.cliente.email && <a href={`mailto:${a.cliente.email}`} className="break-all hover:underline">✉️ {a.cliente.email}</a>}
          </p>
        )}
      </div>

      {rilievo && daRilevare.length > 0 && (
        <section className="card-fase mt-5" style={{ "--fase": "#b45309" } as React.CSSProperties}>
          <h2 className="mb-1">📄 Contratto: cosa rilevare</h2>
          <p className="mb-2 text-xs text-neutral-600">Si apre a parte, in un&apos;altra scheda: guardi cosa ha comprato il cliente e torni qui.</p>
          <div className="flex flex-col gap-2">
            {daRilevare.map((p) => (
              <a key={p.id} href={linkOfferta("", p.preventivoId)} target="_blank" rel="noopener" className="btn-3d btn-3d-amber px-4 py-2 text-sm">
                📄 Apri il contratto{daRilevare.length > 1 ? ` ${nomeProgetto(p)}` : p.preventivo?.oggetto ? ` — ${p.preventivo.oggetto}` : ""}
              </a>
            ))}
            {fileVisibili.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2">
                <p className="mb-1 text-[11px] font-bold uppercase text-amber-900">📁 Cartella «Contratto firmato»</p>
                <ul className="space-y-1">
                  {fileVisibili.map((d) => <li key={d.id}><a href={`/api/documenti/${d.id}`} target="_blank" rel="noopener" className="break-all text-sm font-semibold text-blue-800 underline">📎 {d.nome}</a></li>)}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {rilievo && a.stato !== "ANNULLATO" && (
        <section className="card-fase mt-5" style={{ "--fase": "#16a34a" } as React.CSSProperties}>
          <h2 className="mb-1">📏 Il rilievo</h2>
          {a.stato === "COMPLETATO" ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm">✅ Rilievo eseguito.{collegato ? " Misure, foto, PDF e materiale si caricano nel progetto." : ""}</p>
              {collegato && <Link href={linkProgetto(collegato.id, a.tipo)} className="btn-3d btn-3d-green px-4 py-2 text-sm">📏 Carica il rilievo</Link>}
            </div>
          ) : (
            <form action={rilievoEseguito} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={a.id} /><input type="hidden" name="ritorno" value={ritorno} />
              {!collegato && progetti.length > 0 && (
                <label className="text-[11px] font-bold text-neutral-700">Progetto del cliente
                  <select name="commessaId" required defaultValue={progetti.length === 1 ? progetti[0].id : ""} className="mt-0.5 block rounded border border-neutral-300 px-2 py-1.5 text-sm">
                    <option value="" disabled>— scegli —</option>
                    {progetti.map((p) => <option key={p.id} value={p.id}>{nomeProgetto(p)}</option>)}
                  </select>
                </label>
              )}
              <button className="btn-3d btn-3d-green px-5 py-3 text-base">{collegato || progetti.length ? "✅ Eseguito: carica il rilievo" : "✅ Rilievo eseguito"}</button>
              <p className="w-full text-[11px] text-neutral-600">
                {collegato || progetti.length
                  ? "Segna il rilievo come eseguito e apre il progetto dove carichi misure, foto, PDF e il materiale da aggiungere."
                  : "Il cliente non ha progetti aperti: il rilievo si segna eseguito e i file si caricano qui sotto in «Rilievi misura»."}
              </p>
            </form>
          )}
        </section>
      )}

      <section className="card-fase mt-5" style={{ "--fase": "#0d9488" } as React.CSSProperties}>
        <h2 className="mb-1">📁 Progetto</h2>
        {collegato ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">Collegato al progetto <b>{nomeProgetto(collegato)}</b>.{rilievo ? " Il rilievo (misure, foto, PDF e materiale) si carica dal progetto." : ""}</p>
            <Link href={linkProgetto(collegato.id, a.tipo)} className="btn-3d btn-3d-green px-4 py-2 text-sm">➡️ Portami al progetto</Link>
          </div>
        ) : progetti.length ? (
          <p className="mb-2 text-xs text-neutral-600">Questo appuntamento è libero. {rilievo ? "Collegalo al progetto del cliente: nasce il rilievo della pratica e lo carichi da lì con i suoi moduli (misure, foto, PDF, materiale)." : "Collegalo al progetto del cliente per ritrovarlo nella pratica."}</p>
        ) : (
          <p className="text-sm text-neutral-600">Il cliente non ha progetti aperti: l&apos;appuntamento resta libero. Il progetto nasce quando un&apos;offerta viene confermata.</p>
        )}
        {progetti.filter((p) => p.id !== a.commessaId).length > 0 && (
          <form action={collegaAppuntamentoProgetto} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={a.id} /><input type="hidden" name="ritorno" value={ritorno} />
            <label className="text-[11px] font-bold text-neutral-700">{collegato ? "Collega a un altro progetto" : "Progetto del cliente"}
              <select name="commessaId" required defaultValue="" className="mt-0.5 block rounded border border-neutral-300 px-2 py-1.5 text-sm">
                <option value="" disabled>— scegli —</option>
                {progetti.filter((p) => p.id !== a.commessaId).map((p) => <option key={p.id} value={p.id}>{nomeProgetto(p)}</option>)}
              </select>
            </label>
            <button className="btn-3d btn-3d-blue px-4 py-2 text-sm">🔗 Collega al progetto</button>
          </form>
        )}
      </section>

      {rilievo ? (
        <>
          {/* rilievo: lo fissa il centralino, niente esito da scrivere né rimando al centralino; solo documenti utili e spostamento */}
          <section className="card-fase mt-5" style={{ "--fase": "#7c3aed" } as React.CSSProperties}>
            <h2 className="mb-1">📎 Foto e documenti utili per il rilievo</h2>
            <p className="mb-3 text-xs text-neutral-600">Se ci sono foto, PDF o disegni che servono a chi va a fare il rilievo, caricali qui: restano {a.commessaId ? "nella pratica (cartella «Rilievi misura»)" : "nella scheda del cliente (cartella «Rilievi misura»)"}.</p>
            <Documenti entita={a.commessaId ? "COMMESSA" : "CLIENTE"} entitaId={a.commessaId ?? a.clienteId} titolo="Documenti del rilievo" soloCartelle={["Rilievi misura"]} />
          </section>
          <section className="card-fase mt-5" style={{ "--fase": "#2563eb" } as React.CSSProperties}>
            <h2 className="mb-2">↪ Spostare o annullare</h2>
            {!chiuso ? (
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <form action={spostaAppuntamentoA} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={a.id} /><input type="hidden" name="ritorno" value={ritorno} />
                  <label className="text-[11px] font-bold text-neutral-700">Nuovo giorno e ora
                    <input type="datetime-local" name="dataOra" required defaultValue={perInput(a.dataOra)} className="mt-0.5 block rounded border border-neutral-300 px-2 py-1.5 text-sm" />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-neutral-800">
                    <input type="checkbox" name="invitaCliente" defaultChecked={a.invitaCliente && !!a.cliente.email} disabled={!a.cliente.email} />
                    <span>✉️ Avvisa anche il cliente</span>
                  </label>
                  <button className="btn-3d btn-3d-blue px-4 py-2 text-sm">↪ Sposta</button>
                </form>
                {btnStato("ANNULLATO", "❌ Annulla il rilievo", "btn-3d-red")}
              </div>
            ) : btnStato("PROGRAMMATO", "↩ Riapri", "btn-3d-outline")}
          </section>
        </>
      ) : (
      <section className="card-fase mt-5" style={{ "--fase": "#0ea5e9" } as React.CSSProperties}>
        <h2 className="mb-1">Dopo l&apos;appuntamento: com&apos;è andato?</h2>
        <p className="mb-3 text-xs text-neutral-600">Lo compila chi è andato dal cliente ({a.utente.nome}). Scegli una delle strade qui sotto.</p>
        {a.esito && <p className="mb-3 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">Esito registrato: <b>{a.esito}</b></p>}
        {!chiuso ? (
          <div className="grid gap-3 md:grid-cols-3">
            <form action={esitoAppuntamento} className="flex flex-col gap-2 rounded-lg border border-green-200 bg-green-50/50 p-3">
              <p className="text-sm font-bold text-green-900">✅ Svolto</p>
              <input type="hidden" name="id" value={a.id} /><input type="hidden" name="stato" value="COMPLETATO" /><input type="hidden" name="ritorno" value={ritorno} />
              <textarea name="esito" rows={3} placeholder="Com'è andata? es. interessato a 3 infissi, preparo l'offerta entro venerdì" className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm" />
              <button className="btn-3d btn-3d-green px-4 py-2 text-sm">✅ Segna come svolto</button>
              <p className="text-[11px] text-neutral-600">Poi fai l&apos;offerta con il pulsante «Nuova offerta» qui sopra.</p>
            </form>
            <form action={rifissaDalCentralino} className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-sm font-bold text-amber-900">📞 Da rifissare: ci pensa il centralino</p>
              <input type="hidden" name="id" value={a.id} /><input type="hidden" name="ritorno" value={ritorno} />
              <label className="text-[11px] font-bold text-neutral-700">Richiamare il cliente dal
                <input type="datetime-local" name="richiamaIl" required defaultValue={richiamaDefault} className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm" />
              </label>
              <textarea name="note" rows={2} placeholder="Perché va rifissato? es. c'era solo la moglie, richiamare dopo le 18" className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm" />
              <button className="btn-3d btn-3d-amber px-4 py-2 text-sm">📞 Manda a {telefonista ?? "centralino"}</button>
              <p className="text-[11px] text-neutral-600">L&apos;appuntamento si chiude e {telefonista ?? "la telefonista"} lo trova nei suoi «Task di oggi» dal giorno scelto, con la tua nota, per richiamare e rifissare.</p>
            </form>
            <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              <p className="text-sm font-bold text-blue-900">↪ Lo rifisso io</p>
              <form action={spostaAppuntamentoA} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={a.id} /><input type="hidden" name="ritorno" value={ritorno} />
                <label className="text-[11px] font-bold text-neutral-700">Nuovo giorno e ora
                  <input type="datetime-local" name="dataOra" required defaultValue={perInput(a.dataOra)} className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm" />
                </label>
                <label className="flex items-start gap-2 text-xs text-neutral-800">
                  <input type="checkbox" name="invitaCliente" defaultChecked={a.invitaCliente && !!a.cliente.email} disabled={!a.cliente.email} className="mt-0.5" />
                  <span>✉️ Manda la conferma anche al cliente{!a.cliente.email && <span className="text-red-700"> (cliente senza email)</span>}</span>
                </label>
                <button className="btn-3d btn-3d-blue px-4 py-2 text-sm">↪ Sposta l&apos;appuntamento</button>
              </form>
              <div className="flex flex-wrap gap-1">
                {[1, 7].map((g) => (
                  <form key={g} action={spostaAppuntamentoRapido}>
                    <input type="hidden" name="id" value={a.id} /><input type="hidden" name="giorni" value={g} />
                    <button className="btn-3d btn-3d-outline px-2 py-1 text-xs">+{g === 1 ? "1 giorno" : "1 settimana"}</button>
                  </form>
                ))}
              </div>
              <p className="text-[11px] text-neutral-600">L&apos;invito aggiornato parte da solo a {a.utente.nome.split(" ")[0]}.</p>
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-3">
              {a.stato !== "CONFERMATO" && btnStato("CONFERMATO", "👍 Confermato dal cliente (prima di andare)", "btn-3d-outline")}
              <form action={rifissaDalCentralino}>
                <input type="hidden" name="id" value={a.id} /><input type="hidden" name="ritorno" value={ritorno} />
                <input type="hidden" name="annullato" value="1" />
                <button className="btn-3d btn-3d-red px-4 py-2 text-sm" title="L'appuntamento sparisce dal calendario e il centralino trova il task «Motiva l'annullamento»">❌ Appuntamento annullato</button>
              </form>
            </div>
          </div>
        ) : (
          btnStato("PROGRAMMATO", "↩ Riapri", "btn-3d-outline")
        )}
      </section>
      )}

      {/* modifica completa (tipo, incaricato, luogo, note): solo dal pulsante «Modifica», per i casi rari */}
      {modifica && (
      <section id="modifica" className="card-fase mt-5 scroll-mt-4" style={{ "--fase": "#2563eb" } as React.CSSProperties}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2>✎ Modifica l&apos;appuntamento</h2>
          <Link href={ritorno} scroll={false} className="text-xs font-bold text-neutral-600 underline">✕ chiudi</Link>
        </div>
        <FormAppuntamento
          utenti={utenti} utenteId={a.utenteId} puoAssegnare={tutti} data={perInput(a.dataOra)} cliente={{ id: a.clienteId, nome: a.cliente.nome, email: a.cliente.email }}
          esistente={a} ritorno={ritorno} mailAttiva={await mailConfigurata()}
        />
      </section>
      )}
    </div>
  );
}
