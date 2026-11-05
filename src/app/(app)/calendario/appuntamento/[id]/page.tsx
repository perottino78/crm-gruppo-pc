export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { mailConfigurata } from "@/lib/mail/invio";
import { nomeTipoAppuntamento, vedeTutti, STILE_TIPO } from "@/lib/calendario/eventi";
import { perInput, chiaveGiorno, giornoBreve, oraRoma } from "@/lib/calendario/tempo";
import { esitoAppuntamento, reinviaInvito, spostaAppuntamentoRapido, spostaAppuntamentoA, rifissaDalCentralino } from "@/app/calendario-actions";
import { telefonistaDefaultPerBrand } from "@/lib/leadIngest";
import { aggiungiGiorni } from "@/lib/calendario/tempo";
import FormAppuntamento from "@/components/calendario/FormAppuntamento";
import RisposteModulo from "@/components/lead/RisposteModulo";
import { leggiNoteLead } from "@/lib/automazioni/note-lead";

const STATI: Record<string, string> = { PROGRAMMATO: "bg-blue-100 text-blue-900", CONFERMATO: "bg-green-100 text-green-900", COMPLETATO: "bg-neutral-200 text-neutral-800", ANNULLATO: "bg-red-100 text-red-900" };

export default async function AppuntamentoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params;
  const { msg } = await searchParams;
  const u = await getCurrentUser();
  if (!u) return null;
  const a = await prisma.appuntamento.findUnique({ where: { id }, include: { cliente: true, utente: true } });
  if (!a) notFound();
  const tutti = vedeTutti(u);
  if (!tutti && a.utenteId !== u.id) notFound();
  const utenti = await prisma.utente.findMany({ where: { OR: [{ stato: "ATTIVO" }, { id: a.utenteId }] }, select: { id: true, nome: true }, orderBy: { nome: "asc" } });
  const luogo = a.luogo || [a.cliente.indirizzo, [a.cliente.cap, a.cliente.comune].filter(Boolean).join(" "), a.cliente.provincia].filter(Boolean).join(", ");
  const tel = a.cliente.telefono;
  const fine = new Date(a.dataOra.getTime() + a.durataMin * 60_000);
  const noteLette = leggiNoteLead(a.note);
  const idTel = await telefonistaDefaultPerBrand(a.cliente.brandId);
  const telefonista = idTel ? (await prisma.utente.findUnique({ where: { id: idTel }, select: { nome: true } }))?.nome.split(" ")[0] ?? null : null;
  const richiamaDefault = `${aggiungiGiorni(chiaveGiorno(new Date()), 1)}T10:00`;
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
          {luogo ? <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(luogo)}`} target="_blank" className="btn-3d tile-3d btn-3d-orange"><span className="text-xl">📍</span><span>Naviga</span></a> : <span className="btn-3d tile-3d btn-3d-outline opacity-40"><span className="text-xl">📍</span><span>Naviga</span></span>}
          <Link href={`/clienti/${a.clienteId}`} className="btn-3d tile-3d btn-3d-blue"><span className="text-xl">👤</span><span>Scheda cliente</span></Link>
          <Link href={`/clienti/${a.clienteId}#nuova-offerta`} className="btn-3d tile-3d btn-3d-green"><span className="text-xl">➕</span><span>Nuova offerta</span></Link>
          <form action={reinviaInvito} className="contents">
            <input type="hidden" name="chiave" value={`APPUNTAMENTO:${a.id}`} />
            <input type="hidden" name="ritorno" value={ritorno} />
            <button className="btn-3d tile-3d btn-3d-purple"><span className="text-xl">📨</span><span>Rimanda invito</span></button>
          </form>
          <a href="#modifica" className="btn-3d tile-3d btn-3d-outline"><span className="text-xl">✎</span><span>Modifica</span></a>
        </div>
        {luogo && <p className="px-5 pb-4 text-sm text-neutral-700">📍 {luogo}</p>}
      </div>

      {/* dopo l'appuntamento: lo compila chi ci è andato */}
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
              <p className="text-[11px] text-neutral-600">L&apos;invito aggiornato parte da solo.</p>
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-3">
              {a.stato !== "CONFERMATO" && btnStato("CONFERMATO", "👍 Confermato dal cliente (prima di andare)", "btn-3d-outline")}
              {btnStato("ANNULLATO", "❌ Annulla (non interessato)", "btn-3d-red")}
            </div>
          </div>
        ) : (
          btnStato("PROGRAMMATO", "↩ Riapri", "btn-3d-outline")
        )}
      </section>

      <section id="modifica" className="card-fase mt-5 scroll-mt-4" style={{ "--fase": "#2563eb" } as React.CSSProperties}>
        <h2 className="mb-3">✎ Modifica o sposta</h2>
        <FormAppuntamento
          utenti={utenti} utenteId={a.utenteId} puoAssegnare={tutti} data={perInput(a.dataOra)} cliente={{ id: a.clienteId, nome: a.cliente.nome, email: a.cliente.email }}
          esistente={a} ritorno={ritorno} mailAttiva={await mailConfigurata()}
        />
      </section>
    </div>
  );
}
