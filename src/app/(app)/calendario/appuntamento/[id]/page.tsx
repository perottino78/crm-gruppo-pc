export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { mailConfigurata } from "@/lib/mail/invio";
import { nomeTipoAppuntamento, vedeTutti, STILE_TIPO } from "@/lib/calendario/eventi";
import { perInput, chiaveGiorno, giornoBreve, oraRoma } from "@/lib/calendario/tempo";
import { esitoAppuntamento, reinviaInvito, spostaAppuntamentoRapido } from "@/app/calendario-actions";
import FormAppuntamento from "@/components/calendario/FormAppuntamento";

const STATI: Record<string, string> = { PROGRAMMATO: "bg-blue-100 text-blue-900", CONFERMATO: "bg-green-100 text-green-900", COMPLETATO: "bg-neutral-200 text-neutral-800", ANNULLATO: "bg-red-100 text-red-900" };

export default async function AppuntamentoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params;
  const { msg } = await searchParams;
  const u = await getCurrentUser();
  if (!u) return null;
  const a = await prisma.appuntamento.findUnique({ where: { id }, include: { cliente: true, utente: true } });
  if (!a) notFound();
  const tutti = vedeTutti(u.ruolo);
  if (!tutti && a.utenteId !== u.id) notFound();
  const utenti = await prisma.utente.findMany({ where: { passwordHash: { not: null } }, select: { id: true, nome: true }, orderBy: { nome: "asc" } });
  const luogo = a.luogo || [a.cliente.indirizzo, [a.cliente.cap, a.cliente.comune].filter(Boolean).join(" "), a.cliente.provincia].filter(Boolean).join(", ");
  const tel = a.cliente.telefono;
  const fine = new Date(a.dataOra.getTime() + a.durataMin * 60_000);
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
      <Link href={`/calendario?giorno=${chiaveGiorno(a.dataOra)}`} className="text-xs text-neutral-600 hover:underline">← Calendario</Link>
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
            {a.note && <p className="text-sm text-neutral-800 mt-1 whitespace-pre-line">📝 {a.note}</p>}
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

      {/* esito */}
      <section className="card-fase mt-5" style={{ "--fase": "#0ea5e9" } as React.CSSProperties}>
        <h2 className="mb-2">Com&apos;è andato?</h2>
        {a.esito && <p className="text-sm mb-2">Esito: <b>{a.esito}</b></p>}
        {!chiuso ? (
          <div className="flex flex-col gap-3">
            <form action={esitoAppuntamento} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="stato" value="COMPLETATO" />
              <input type="hidden" name="ritorno" value={ritorno} />
              <div className="flex-1 min-w-[240px]">
                <label className="text-[11px] font-bold text-neutral-700">Esito in breve</label>
                <input name="esito" placeholder="es. interessato, preparo l'offerta entro venerdì" className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm" />
              </div>
              <button className="btn-3d btn-3d-green text-sm px-4 py-2">✅ Svolto</button>
            </form>
            <div className="flex flex-wrap gap-2">
              {a.stato !== "CONFERMATO" && btnStato("CONFERMATO", "👍 Confermato dal cliente", "btn-3d-blue")}
              {[1, 7].map((g) => (
                <form key={g} action={spostaAppuntamentoRapido}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="giorni" value={g} />
                  <button className="btn-3d btn-3d-outline text-sm px-4 py-2">↪ Sposta di {g === 1 ? "1 giorno" : "1 settimana"}</button>
                </form>
              ))}
              {btnStato("ANNULLATO", "❌ Annulla appuntamento", "btn-3d-red")}
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
          esistente={a} ritorno={ritorno} mailAttiva={mailConfigurata()}
        />
      </section>
    </div>
  );
}
