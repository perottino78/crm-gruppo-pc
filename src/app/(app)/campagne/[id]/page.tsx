export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { chiaveGiorno } from "@/lib/calendario/tempo";
import { salvaCampagna, provaCampagna, inviaCampagna, duplicaCampagna, eliminaCampagna, puoFareCampagne } from "@/app/campagne-actions";
import { contaDestinatari, filtriCampagna, emailCampagna } from "@/lib/campagne/motore";
import { CATEGORIE, SENZA_STATO, SITUAZIONI, giorniAllaScadenza, testoGiorni } from "@/lib/campagne/regole";
import CampiEmail from "@/components/campagne/CampiEmail";

const perc = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const quando = (d: Date | null) => (d ? d.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";
const casella = (attivo: boolean) => `flex items-center gap-1.5 text-sm px-2 py-1 rounded border ${attivo ? "border-teal-400 bg-teal-50" : "border-neutral-200 bg-white"}`;

/** Una campagna: destinatari (filtri), testo dell'email, scadenza, prova e invio. */
export default async function CampagnaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; errore?: string }> }) {
  const u = await getCurrentUser();
  if (!(await puoFareCampagne(u))) notFound();
  const { id } = await params;
  const p = await searchParams;
  const c = await prisma.campagna.findUnique({ where: { id }, include: { invii: { select: { id: true, clienteId: true, email: true, stato: true, motivo: true, inviataIl: true, apertaIl: true, aperture: true, clicIl: true, clic: true }, orderBy: [{ clicIl: { sort: "desc", nulls: "last" } }, { apertaIl: { sort: "desc", nulls: "last" } }, { inviataIl: "desc" }] } } });
  if (!c) notFound();
  const [brand, perStato, perProvenienza, commerciali, conti, telefoniste, richiamati] = await Promise.all([
    prisma.brand.findMany({ orderBy: { nome: "asc" }, select: { nome: true } }),
    prisma.cliente.groupBy({ by: ["statoLead"], _count: { _all: true }, orderBy: { _count: { statoLead: "desc" } } }),
    prisma.cliente.groupBy({ by: ["origine"], _count: { _all: true }, orderBy: { _count: { origine: "desc" } } }),
    prisma.utente.findMany({ where: { clientiResponsabile: { some: {} } }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    filtriCampagna(c).then(contaDestinatari),
    prisma.utente.findMany({ where: { stato: "ATTIVO", OR: [{ ruolo: "TELEFONISTA" }, { ruolo: "MARKETING" }] }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.leadEvento.count({ where: { tipo: "campagna.clic", testo: { contains: `campagna «${c.nome}»` } } }),
  ]);
  const n = (s: string) => c.invii.filter((i) => i.stato === s).length;
  const g = c.validaFino ? giorniAllaScadenza(c.validaFino, new Date()) : null;
  const anteprima = emailCampagna(c, { id: "anteprima", nome: "Mario Rossi" });
  const stati = [...perStato.filter((s) => s.statoLead).map((s) => ({ v: s.statoLead!, n: s._count._all })), { v: SENZA_STATO, n: perStato.filter((s) => !s.statoLead).reduce((t, s) => t + s._count._all, 0) }];

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link href="/campagne" className="btn-indietro">← Campagne</Link>
        <h1 className="text-2xl font-bold text-neutral-900">📣 {c.nome}</h1>
        <p className="text-sm text-neutral-600">
          {c.stato === "BOZZA" ? "Bozza" : c.stato === "IN_INVIO" ? "In invio" : "Inviata"}{c.creataDa ? ` · creata da ${c.creataDa}` : ""}
          {g !== null && <span className={g <= 3 ? " text-red-700 font-semibold" : ""}> · {g < 0 ? "scaduta" : `scade ${testoGiorni(g)}`}</span>}
        </p>
      </div>
      {p.ok && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {p.ok}</p>}
      {p.errore && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{p.errore}</p>}

      <form action={salvaCampagna} className="space-y-4">
        <input type="hidden" name="id" value={c.id} />
        <div className="card-fase bg-white rounded-lg border border-neutral-200 p-4 space-y-3">
          <p className="font-semibold">1. A chi mandarla</p>
          <div>
            <p className="text-xs text-neutral-600 mb-1">Marchio (nessuno spuntato = tutti)</p>
            <div className="flex flex-wrap gap-2">{brand.map((b) => <label key={b.nome} className={casella(c.marchi.includes(b.nome))}><input type="checkbox" name="marchi" value={b.nome} defaultChecked={c.marchi.includes(b.nome)} />{b.nome}</label>)}</div>
          </div>
          <div>
            <p className="text-xs text-neutral-600 mb-1">Stato del contatto (nessuno spuntato = tutti)</p>
            <div className="flex flex-wrap gap-2">{stati.map((s) => <label key={s.v} className={casella(c.stati.includes(s.v))}><input type="checkbox" name="stati" value={s.v} defaultChecked={c.stati.includes(s.v)} />{s.v === SENZA_STATO ? "senza stato" : s.v} <span className="text-xs text-neutral-500">({s.n})</span></label>)}</div>
          </div>
          <div>
            <p className="text-xs text-neutral-600 mb-1">Tipo (Cliente = ha già comprato da noi)</p>
            <div className="flex flex-wrap gap-2">{CATEGORIE.map((k) => <label key={k} className={casella(c.categorie.includes(k))}><input type="checkbox" name="categorie" value={k} defaultChecked={c.categorie.includes(k)} />{k}</label>)}</div>
          </div>
          <div className="grid sm:grid-cols-3 gap-2">
            <label className="text-xs text-neutral-600">Provenienza
              <select name="provenienza" defaultValue={c.provenienza ?? ""} className={`${inp} w-full`}><option value="">tutte</option>{perProvenienza.filter((x) => x.origine).map((x) => <option key={x.origine} value={x.origine!}>{x.origine} ({x._count._all})</option>)}</select>
            </label>
            <label className="text-xs text-neutral-600">Commerciale
              <select name="commercialeId" defaultValue={c.commercialeId ?? ""} className={`${inp} w-full`}><option value="">tutti</option>{commerciali.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
            </label>
            <label className="text-xs text-neutral-600">Provincia
              <input name="provincia" defaultValue={c.provincia ?? ""} placeholder="es. TO" className={`${inp} w-full`} />
            </label>
          </div>
          <div className="rounded border border-orange-200 bg-orange-50/60 p-3 space-y-2">
            <p className="text-xs text-neutral-700 font-semibold">Situazione del contatto (per trovare chi è già interessato)</p>
            <div className="flex flex-wrap gap-2">
              <label className={casella(!c.situazione)}><input type="radio" name="situazione" value="" defaultChecked={!c.situazione} />tutti</label>
              {SITUAZIONI.map((x) => <label key={x.codice} title={x.spiega} className={casella(c.situazione === x.codice)}><input type="radio" name="situazione" value={x.codice} defaultChecked={c.situazione === x.codice} />{x.nome}</label>)}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-700">
              Offerte fatte dal <input type="date" name="offerteDal" defaultValue={c.offerteDal ? chiaveGiorno(c.offerteDal) : ""} className={inp} />
              al <input type="date" name="offerteAl" defaultValue={c.offerteAl ? chiaveGiorno(c.offerteAl) : ""} className={inp} />
              <span className="text-neutral-500">(solo per «offerta non chiusa»; vuoto = tutte)</span>
            </div>
            <p className="text-[11px] text-neutral-600">«Offerta non chiusa» = ha avuto un preventivo nel CRM o in BConsole e non ha mai firmato (niente contratto, ordine o fattura). Sono i contatti più caldi: hanno già incontrato un commerciale.</p>
          </div>
          <p className="text-sm rounded bg-teal-50 border border-teal-200 px-3 py-2">
            👥 <b>{conti.raggiungibili}</b> riceveranno l&apos;email · {conti.totale} rientrano nei filtri ({conti.senzaEmail} senza email, {conti.disiscritti} disiscritti{conti.rimbalzati ? `, ${conti.rimbalzati} con email rimbalzata` : ""}).
            <span className="text-xs text-neutral-600"> Il conteggio si aggiorna quando salvi.</span>
          </p>
        </div>

        <div className="card-fase bg-white rounded-lg border border-neutral-200 p-4 space-y-3">
          <p className="font-semibold">2. L&apos;email</p>
          <label className="text-xs text-neutral-600 block">Nome della campagna (interno)<input name="nome" defaultValue={c.nome} className={`${inp} w-full`} /></label>
          <label className="text-xs text-neutral-600 block">Oggetto<input name="oggetto" defaultValue={c.oggetto} placeholder="es. {nome}, la tua pergola con lo sconto in fattura" className={`${inp} w-full`} /></label>
          <CampiEmail preheader={c.preheader} formato={c.formato} testo={c.testo} html={c.html} tracciamento={c.tracciamento} />
          <label className="text-xs text-neutral-600 block">Valida fino al
            <input type="date" name="validaFino" defaultValue={c.validaFino ? chiaveGiorno(c.validaFino) : ""} className={`${inp} ml-2`} />
            <span className="ml-2 font-normal text-neutral-500">prima della scadenza arriva l&apos;avviso di aggiornarla (giorni e destinatari in Impostazioni › Email automatiche)</span>
          </label>
          <div className={`rounded border p-3 space-y-2 ${c.richiama ? "border-green-300 bg-green-50" : "border-neutral-200 bg-neutral-50"}`}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="richiama" defaultChecked={c.richiama} className="mt-1" />
              <span><b>📞 Chi clicca diventa una chiamata</b> per la telefonista: al primo clic sull&apos;email il contatto compare nei suoi «Task di oggi» come «Da recuperare», con la nota della campagna. Chi ha già un appuntamento non viene richiamato.</span>
            </label>
            <label className="text-xs text-neutral-600 flex flex-wrap items-center gap-2">Telefonista
              <select name="richiamaTelefonistaId" defaultValue={c.richiamaTelefonistaId ?? ""} className={`${inp} max-w-full`}><option value="">quella del marchio</option>{telefoniste.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
            </label>
            {richiamati > 0 && <p className="text-xs text-green-800 font-semibold">Finora {richiamati} contatti sono diventati chiamate.</p>}
          </div>
          <button className="btn-3d btn-3d-blue text-sm px-4 py-2">💾 Salva</button>
        </div>
      </form>

      <div className="card-fase bg-white rounded-lg border border-neutral-200 p-4 space-y-3">
        <p className="font-semibold">3. Prova e invio</p>
        <details open>
          <summary className="text-sm cursor-pointer">Anteprima com&apos;è salvata (con un nome di esempio)</summary>
          <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
            <p className="text-sm"><b>{anteprima.oggetto || "— oggetto mancante —"}</b> <span className="text-neutral-500">— {c.preheader || <i>senza preheader</i>}</span></p>
            <iframe title="Anteprima dell'email" srcDoc={anteprima.html} sandbox="" className="mt-2 h-[520px] w-full rounded border border-neutral-200 bg-white" />
          </div>
        </details>
        <div className="flex flex-wrap items-end gap-2">
          <form action={provaCampagna} className="flex items-end gap-2">
            <input type="hidden" name="id" value={c.id} />
            <label className="text-xs text-neutral-600">Email di prova a<input name="a" defaultValue={u?.email ?? ""} className={`${inp} w-64 block`} /></label>
            <button className="btn-3d btn-3d-outline text-sm px-3 py-2">✉️ Manda la prova</button>
          </form>
          <form action={inviaCampagna}>
            <input type="hidden" name="id" value={c.id} />
            <button className="btn-3d btn-3d-orange text-sm px-4 py-2">{c.stato === "BOZZA" ? `📤 Invia a ${conti.raggiungibili} contatti` : "📤 Invia ai nuovi che rientrano nei filtri"}</button>
          </form>
          <form action={duplicaCampagna}><input type="hidden" name="id" value={c.id} /><button className="btn-3d btn-3d-outline text-sm px-3 py-2">Duplica</button></form>
          {c.stato === "BOZZA" && <form action={eliminaCampagna}><input type="hidden" name="id" value={c.id} /><button className="text-sm text-red-700 underline px-2">Elimina bozza</button></form>}
        </div>
        <p className="text-xs text-neutral-600">Salva prima di inviare. Le email partono a blocchi da {"promozionale@gruppopec.com"}, ognuna con il link per disiscriversi; chi l&apos;ha già ricevuta non la riceve due volte.</p>
        {c.invii.length > 0 && (
          <p className="text-sm">✉️ <b>{n("INVIATA")}</b> inviate · {n("IN_ATTESA") + n("IN_CORSO")} in coda · <span className={n("FALLITA") ? "text-red-700" : ""}>{n("FALLITA")} non inviate</span> · {n("SOPPRESSA")} disiscritti nel frattempo</p>
        )}
      </div>

      {c.invii.some((i) => i.stato === "INVIATA" || i.stato === "RIMBALZATA") && (() => {
        const inviate = c.invii.filter((i) => i.stato === "INVIATA" || i.stato === "RIMBALZATA");
        const rimbalzate = c.invii.filter((i) => i.stato === "RIMBALZATA");
        const aperte = inviate.filter((i) => i.apertaIl).length, cliccate = inviate.filter((i) => i.clicIl).length;
        return (
          <div className="card-fase bg-white rounded-lg border border-neutral-200 p-4 space-y-3" style={{ ["--fase" as string]: "#0d9488" }}>
            <p className="font-semibold">4. Com&apos;è andata</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[["Inviate", String(inviate.length), `${inviate.length - rimbalzate.length} recapitate`], ["Aperte", String(aperte), `${perc(aperte, inviate.length)} delle inviate`], ["Hanno cliccato", String(cliccate), `${perc(cliccate, inviate.length)} delle inviate · ${perc(cliccate, aperte)} di chi l'ha aperta`], ["Rimbalzate", String(rimbalzate.length), rimbalzate.length ? "indirizzo sbagliato, casella piena…" : "nessun mancato recapito"], ["Disiscritti / falliti", `${n("SOPPRESSA")} / ${n("FALLITA")}`, "non raggiunti"]].map(([t, v, d]) => (
                <div key={t} className="rounded-lg border border-neutral-200 p-3"><div className="text-[11px] font-bold uppercase text-neutral-500">{t}</div><div className="text-2xl font-extrabold tabular-nums">{v}</div><div className="text-xs text-neutral-600">{d}</div></div>
              ))}
            </div>
            {!c.tracciamento && <p className="text-xs text-amber-800">Il tracciamento di aperture e clic è spento per questa campagna.</p>}
            <details>
              <summary className="cursor-pointer text-sm">Destinatari ({inviate.length}): prima chi ha cliccato, poi chi ha aperto</summary>
              <div className="mt-2 max-h-96 overflow-auto rounded border border-neutral-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-neutral-50 text-neutral-600"><tr><th className="px-2 py-1 text-left">Email</th><th className="px-2 text-left">Inviata</th><th className="px-2 text-left">Aperta</th><th className="px-2 text-left">Clic</th></tr></thead>
                  <tbody>
                    {inviate.slice(0, 500).map((i) => (
                      <tr key={i.id} className="border-t border-neutral-100">
                        <td className="px-2 py-1"><Link href={`/clienti/${i.clienteId}`} className="underline">{i.email}</Link></td>
                        <td className="px-2">{quando(i.inviataIl)}</td>
                        <td className="px-2">{i.apertaIl ? `✓ ${quando(i.apertaIl)}${i.aperture > 1 ? ` (${i.aperture} volte)` : ""}` : "—"}</td>
                        <td className="px-2">{i.stato === "RIMBALZATA" ? <span className="font-semibold text-red-700">📭 rimbalzata: {i.motivo}</span> : i.clicIl ? `👆 ${quando(i.clicIl)}${i.clic > 1 ? ` (${i.clic})` : ""}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        );
      })()}
    </div>
  );
}
