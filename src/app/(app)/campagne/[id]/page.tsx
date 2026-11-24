export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { chiaveGiorno } from "@/lib/calendario/tempo";
import { salvaCampagna, completaProvince, provaCampagna, inviaCampagna, duplicaCampagna, eliminaCampagna, puoFareCampagne, rinominaCampagna, impostaAbTest, programmaCampagna, annullaProgrammazione } from "@/app/campagne-actions";
import { contaDestinatari, filtriCampagna, emailCampagna, contenutoDi } from "@/lib/campagne/motore";
import { CATEGORIE, SENZA_STATO, SITUAZIONI, STATI_RICEVUTA, giorniAllaScadenza, testoGiorni, whereRaggiungibile } from "@/lib/campagne/regole";
import { PROVINCE } from "@/lib/geo/province";
import { siglaDaTesto, provinciaDaComune, normalizza } from "@/lib/geo/localita";
import ScegliLuoghi from "@/components/campagne/ScegliLuoghi";
import CampiEmail from "@/components/campagne/CampiEmail";
import GruppiAB from "@/components/campagne/GruppiAB";
import FormAutoSalva from "@/components/FormAutoSalva";
import BottoneConferma from "@/components/BottoneConferma";

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
  const c = await prisma.campagna.findUnique({ where: { id }, include: { varianti: { orderBy: { posizione: "asc" }, include: { _count: { select: { invii: true } } } }, invii: { select: { id: true, clienteId: true, email: true, stato: true, motivo: true, inviataIl: true, apertaIl: true, aperture: true, clicIl: true, clic: true, varianteId: true }, orderBy: [{ clicIl: { sort: "desc", nulls: "last" } }, { apertaIl: { sort: "desc", nulls: "last" } }, { inviataIl: "desc" }] } } });
  if (!c) notFound();
  const [brand, perStato, perProvenienza, commerciali, conti, telefoniste, richiamati, altreCampagne, perProvincia, perComune] = await Promise.all([
    prisma.brand.findMany({ orderBy: { nome: "asc" }, select: { nome: true } }),
    prisma.cliente.groupBy({ by: ["statoLead"], _count: { _all: true }, orderBy: { _count: { statoLead: "desc" } } }),
    prisma.cliente.groupBy({ by: ["origine"], _count: { _all: true }, orderBy: { _count: { origine: "desc" } } }),
    prisma.utente.findMany({ where: { clientiResponsabile: { some: {} } }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    filtriCampagna(c).then(contaDestinatari),
    prisma.utente.findMany({ where: { stato: "ATTIVO", OR: [{ ruolo: "TELEFONISTA" }, { ruolo: "MARKETING" }] }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.leadEvento.count({ where: { tipo: "campagna.clic", testo: { contains: `campagna «${c.nome}»` } } }),
    // campagne già partite (o in partenza) da poter escludere: chi le ha ricevute non riceve questa
    prisma.campagna.findMany({ where: { id: { not: c.id }, OR: [{ invii: { some: {} } }, { id: { in: c.escludiCampagne } }] }, orderBy: [{ inviataIl: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: 30, select: { id: true, nome: true, inviataIl: true, _count: { select: { invii: { where: { stato: { in: STATI_RICEVUTA } } } } } } }),
    // dove abitano i contatti raggiungibili (per scegliere province e comuni)
    prisma.cliente.groupBy({ by: ["provincia"], where: whereRaggiungibile, _count: { _all: true } }),
    prisma.cliente.groupBy({ by: ["comune"], where: { AND: [whereRaggiungibile, { comune: { not: null } }] }, _count: { _all: true }, orderBy: { _count: { comune: "desc" } }, take: 2500 }),
  ]);
  // consensi dati e revoche arrivati da questa campagna (link nell'email o «disiscriviti»), per contatto
  const consensiCampagna = await prisma.consensoMarketing.findMany({ where: { campagnaId: c.id }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, clienteId: true, email: true, stato: true, createdAt: true } });
  const nomiConsensi = new Map((await prisma.cliente.findMany({ where: { id: { in: consensiCampagna.map((x) => x.clienteId).filter((x): x is string => !!x) } }, select: { id: true, nome: true } })).map((x) => [x.id, x.nome]));
  const n = (s: string) => c.invii.filter((i) => i.stato === s).length;
  const g = c.validaFino ? giorniAllaScadenza(c.validaFino, new Date()) : null;
  const ab = c.abTest && c.varianti.length > 0;
  const anteprime = ab ? c.varianti.map((v) => ({ nome: v.nome, preheader: v.preheader, m: emailCampagna(contenutoDi(c, v), { id: "anteprima", nome: "Mario Rossi" }) })) : [{ nome: "", preheader: c.preheader, m: emailCampagna(c, { id: "anteprima", nome: "Mario Rossi" }) }];
  const contaProv = new Map<string, number>();
  let senzaProvincia = 0;
  for (const r of perProvincia) { const sg = siglaDaTesto(r.provincia); if (sg) contaProv.set(sg, (contaProv.get(sg) ?? 0) + r._count._all); else senzaProvincia += r._count._all; }
  const opzioniProvince = PROVINCE.map((pr) => ({ ...pr, n: contaProv.get(pr.sigla) ?? 0 }));
  const perNomeComune = new Map<string, { nome: string; n: number; max: number }>();
  for (const r of perComune) {
    if (!r.comune?.trim()) continue;
    const k = normalizza(r.comune);
    const e = perNomeComune.get(k);
    if (!e) perNomeComune.set(k, { nome: r.comune.trim(), n: r._count._all, max: r._count._all });
    else { e.n += r._count._all; if (r._count._all > e.max) { e.max = r._count._all; e.nome = r.comune.trim(); } }
  }
  const opzioniComuni = [...perNomeComune.values()].sort((a, b) => b.n - a.n).map((e) => ({ nome: e.nome, n: e.n, sigla: provinciaDaComune(e.nome) }));
  const stati = [...perStato.filter((s) => s.statoLead).map((s) => ({ v: s.statoLead!, n: s._count._all })), { v: SENZA_STATO, n: perStato.filter((s) => !s.statoLead).reduce((t, s) => t + s._count._all, 0) }];

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link href="/campagne" className="btn-indietro">← Campagne</Link>
        <FormAutoSalva key={c.nome} action={rinominaCampagna} className="mt-2 flex items-center gap-2">
          <input type="hidden" name="id" value={c.id} />
          <span className="text-2xl">{c.abTest ? "🧪" : "📣"}</span>
          <input name="nome" defaultValue={c.nome} required maxLength={150} aria-label="Nome della campagna" title="Clicca per cambiare il nome: si salva da solo"
            className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-2xl font-bold text-neutral-900 hover:border-neutral-300 focus:border-teal-500 focus:bg-white focus:outline-none" />
          <span className="shrink-0 text-xs text-neutral-500">✏️ clicca per rinominare</span>
        </FormAutoSalva>
        <p className="text-sm text-neutral-600">
          {c.stato === "BOZZA" ? "Bozza" : c.stato === "PROGRAMMATA" ? "🕒 Programmata" : c.stato === "IN_INVIO" ? "In invio" : "Inviata"}{c.creataDa ? ` · creata da ${c.creataDa}` : ""}
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
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="text-xs text-neutral-600">Provenienza
              <select name="provenienza" defaultValue={c.provenienza ?? ""} className={`${inp} w-full`}><option value="">tutte</option>{perProvenienza.filter((x) => x.origine).map((x) => <option key={x.origine} value={x.origine!}>{x.origine} ({x._count._all})</option>)}</select>
            </label>
            <label className="text-xs text-neutral-600">Commerciale
              <select name="commercialeId" defaultValue={c.commercialeId ?? ""} className={`${inp} w-full`}><option value="">tutti</option>{commerciali.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
            </label>
          </div>
          {c.provincia && (
            <label className="block text-xs text-neutral-600">Provincia (filtro scritto a mano nella versione di prima: puoi svuotarlo e usare la scelta qui sotto)
              <input name="provincia" defaultValue={c.provincia} className={`${inp} w-full sm:w-48`} />
            </label>
          )}
          <ScegliLuoghi province={opzioniProvince} comuni={opzioniComuni} scelteProvince={c.province} scelteComuni={c.comuni} senzaProvincia={senzaProvincia} azioneCompleta={completaProvince} />
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
          {altreCampagne.length > 0 && (
            <details open={c.escludiCampagne.length > 0} className="rounded border border-sky-200 bg-sky-50/60 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-neutral-700">🚫 Escludi chi ha già ricevuto un&apos;altra campagna{c.escludiCampagne.length ? ` (${c.escludiCampagne.length} ${c.escludiCampagne.length === 1 ? "scelta" : "scelte"})` : ""}</summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {altreCampagne.map((x) => (
                  <label key={x.id} className={casella(c.escludiCampagne.includes(x.id))}>
                    <input type="checkbox" name="escludiCampagne" value={x.id} defaultChecked={c.escludiCampagne.includes(x.id)} />
                    {x.nome} <span className="text-xs text-neutral-500">· {x._count.invii} contatti{x.inviataIl ? ` · ${x.inviataIl.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}` : ""}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-neutral-600">Chi ha ricevuto (o sta ricevendo) le campagne spuntate non riceve questa: utile per scrivere solo ai contatti nuovi con lo stesso messaggio.</p>
            </details>
          )}
          <p className="text-sm rounded bg-teal-50 border border-teal-200 px-3 py-2">
            👥 <b>{conti.raggiungibili}</b> riceveranno l&apos;email · {conti.totale} rientrano nei filtri ({conti.senzaEmail} senza email, {conti.disiscritti} disiscritti{conti.rimbalzati ? `, ${conti.rimbalzati} con email rimbalzata` : ""}).
            <span className="text-xs text-neutral-600"> Il conteggio si aggiorna quando salvi.</span>
          </p>
        </div>

        <div className="card-fase bg-white rounded-lg border border-neutral-200 p-4 space-y-3">
          <p className="font-semibold">2. L&apos;email</p>
          {c.abTest ? (
            <div className="space-y-3 rounded-lg border border-purple-200 bg-purple-50/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm"><b>🧪 A/B test</b>: chi rientra nei filtri qui sopra viene diviso in parti uguali fra i gruppi; ogni gruppo riceve la sua versione dell&apos;email. Poi in «Com&apos;è andata» vedi quale funziona meglio.</p>
                {c.invii.length === 0 && <button formAction={impostaAbTest} name="attivo" value="0" className="btn-3d btn-3d-outline px-3 py-1 text-xs">Torna a un&apos;email unica</button>}
              </div>
              <GruppiAB contatti={conti.raggiungibili} iniziali={c.varianti.map((v) => ({ id: v.id, nome: v.nome, oggetto: v.oggetto, preheader: v.preheader, formato: v.formato, testo: v.testo, html: v.html, usato: v._count.invii > 0 }))} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="tracciamento" defaultChecked={c.tracciamento} /> 📈 Traccia aperture e clic (serve per capire quale gruppo funziona meglio)</label>
            </div>
          ) : (
            <>
              <label className="text-xs text-neutral-600 block">Oggetto<input name="oggetto" defaultValue={c.oggetto} placeholder="es. {nome}, la tua pergola con lo sconto in fattura" className={`${inp} w-full`} /></label>
              <CampiEmail preheader={c.preheader} formato={c.formato} testo={c.testo} html={c.html} tracciamento={c.tracciamento} />
              <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-purple-300 bg-purple-50/40 px-3 py-2 text-sm">
                <span>🧪 Vuoi provare versioni diverse (oggetto, preheader, testo) su gruppi di contatti?</span>
                <button formAction={impostaAbTest} name="attivo" value="1" className="btn-3d btn-3d-purple px-3 py-1 text-xs">Fai un A/B test</button>
                <span className="text-[11px] text-neutral-500">(salva prima le modifiche: la versione salvata diventa il punto di partenza di ogni gruppo)</span>
              </div>
            </>
          )}
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
        {anteprime.map((a, i) => (
          <details key={i} open={i === 0}>
            <summary className="text-sm cursor-pointer">Anteprima {a.nome ? <b>{a.nome}</b> : null} com&apos;è salvata (con un nome di esempio)</summary>
            <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
              <p className="text-sm"><b>{a.m.oggetto || "— oggetto mancante —"}</b> <span className="text-neutral-500">— {a.preheader || <i>senza preheader</i>}</span></p>
              <iframe title={`Anteprima dell'email ${a.nome}`} srcDoc={a.m.html} sandbox="" className="mt-2 h-[520px] w-full rounded border border-neutral-200 bg-white" />
            </div>
          </details>
        ))}
        <div className="flex flex-wrap items-end gap-2">
          <form action={provaCampagna} className="flex items-end gap-2">
            <input type="hidden" name="id" value={c.id} />
            <label className="text-xs text-neutral-600">Email di prova a<input name="a" defaultValue={u?.email ?? ""} className={`${inp} w-64 block`} /></label>
            <button className="btn-3d btn-3d-outline text-sm px-3 py-2">✉️ Manda la prova</button>
          </form>
          <form action={inviaCampagna}>
            <input type="hidden" name="id" value={c.id} />
            <button className="btn-3d btn-3d-orange text-sm px-4 py-2">{c.inviataIl ? "📤 Invia adesso ai nuovi che rientrano nei filtri" : `📤 Invia adesso a ${conti.raggiungibili} contatti`}</button>
          </form>
          <form action={duplicaCampagna}><input type="hidden" name="id" value={c.id} /><button className="btn-3d btn-3d-outline text-sm px-3 py-2">Duplica</button></form>
          <form action={eliminaCampagna}><input type="hidden" name="id" value={c.id} /><BottoneConferma messaggio={c.invii.length ? `Eliminare «${c.nome}»? Spariscono anche le statistiche e gli invii ancora in coda non partono.` : `Eliminare «${c.nome}»?`} className="text-sm text-red-700 underline px-2">🗑 Elimina</BottoneConferma></form>
        </div>
        {c.stato === "PROGRAMMATA" && c.programmataIl ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm">
            <span>🕒 <b>Invio programmato</b> per {c.programmataIl.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}: parte da sola, ai contatti che rientrano nei filtri in quel momento. Fino ad allora puoi modificarla (ricordati di salvare).</span>
            <form action={annullaProgrammazione}><input type="hidden" name="id" value={c.id} /><button className="btn-3d btn-3d-outline px-3 py-1 text-xs">Annulla la programmazione</button></form>
          </div>
        ) : c.stato !== "IN_INVIO" && (
          <form action={programmaCampagna} className="flex flex-wrap items-end gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2">
            <input type="hidden" name="id" value={c.id} />
            <span className="text-sm font-semibold">🕒 Oppure programma l&apos;invio:</span>
            <label className="text-xs text-neutral-600">Giorno<input type="date" name="giorno" required min={chiaveGiorno(new Date())} className={`${inp} block`} /></label>
            <label className="text-xs text-neutral-600">Ora<input type="time" name="ora" required defaultValue="09:00" step={300} className={`${inp} block`} /></label>
            <button className="btn-3d btn-3d-blue text-sm px-4 py-2">🕒 Programma l&apos;invio</button>
          </form>
        )}
        <p className="text-xs text-neutral-600">Salva prima di inviare. Le email partono a blocchi da {"promozionale@gruppopec.com"}, ognuna con il link per disiscriversi; chi l&apos;ha già ricevuta non la riceve due volte.</p>
        {c.invii.length > 0 && (
          <p className="text-sm">✉️ <b>{n("INVIATA")}</b> inviate · {n("IN_ATTESA") + n("IN_CORSO")} in coda · <span className={n("FALLITA") ? "text-red-700" : ""}>{n("FALLITA")} non inviate</span> · {n("SOPPRESSA")} disiscritti nel frattempo</p>
        )}
      </div>

      {consensiCampagna.length > 0 && (
        <div className="card-fase p-4">
          <h2 className="font-black mb-2">🔒 Consensi e revoche da questa campagna ({consensiCampagna.filter((x) => x.stato === "CONCESSO").length} consensi · {consensiCampagna.filter((x) => x.stato === "REVOCATO").length} revoche)</h2>
          <ul className="text-sm divide-y divide-neutral-100">
            {consensiCampagna.map((x) => (
              <li key={x.id} className="py-1 flex gap-3">
                <span className={x.stato === "CONCESSO" ? "text-emerald-700 font-bold" : "text-red-700 font-bold"}>{x.stato === "CONCESSO" ? "✓ Consenso" : "✕ Revoca"}</span>
                <span>{x.clienteId ? <Link href={`/clienti/${x.clienteId}?sez=anagrafica#consenso`} className="underline">{nomiConsensi.get(x.clienteId) ?? x.email}</Link> : x.email}</span>
                <span className="text-neutral-500 ml-auto">{x.createdAt.toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
            {ab && (() => {
              const righe = c.varianti.map((v) => {
                const suoi = inviate.filter((i) => i.varianteId === v.id);
                const ap = suoi.filter((i) => i.apertaIl).length, cl = suoi.filter((i) => i.clicIl).length;
                return { v, n: suoi.length, ap, cl, tasso: suoi.length ? cl / suoi.length : 0 };
              });
              const meglio = righe.reduce((m, r) => (r.n && r.tasso > (m?.tasso ?? -1) ? r : m), null as (typeof righe)[number] | null);
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-neutral-500"><th className="py-1">Gruppo</th><th>Oggetto</th><th className="text-right">Inviate</th><th className="text-right">Aperte</th><th className="text-right">Clic</th></tr></thead>
                    <tbody>
                      {righe.map((r) => (
                        <tr key={r.v.id} className={`border-t border-neutral-100 ${meglio?.v.id === r.v.id && r.cl > 0 ? "bg-green-50" : ""}`}>
                          <td className="py-1 font-semibold">{r.v.nome}{meglio?.v.id === r.v.id && r.cl > 0 ? " 🏆" : ""}</td>
                          <td className="max-w-[260px] truncate text-neutral-600">{r.v.oggetto}</td>
                          <td className="text-right tabular-nums">{r.n}</td>
                          <td className="text-right tabular-nums">{r.ap} · {perc(r.ap, r.n)}</td>
                          <td className="text-right tabular-nums font-semibold">{r.cl} · {perc(r.cl, r.n)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-1 text-[11px] text-neutral-500">🏆 = il gruppo con più clic in proporzione. Con pochi invii la differenza può essere solo fortuna: conta di più su qualche centinaio di contatti per gruppo.</p>
                </div>
              );
            })()}
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
