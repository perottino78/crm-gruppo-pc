"use server";

import { puo, type ConPermessi } from "@/lib/permessi/catalogo";
import { puoMarketing } from "@/lib/utenti/stato";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Utente } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { daOraRoma } from "@/lib/calendario/tempo";
import { accodaCampagna, inviaProva, CHIAVE_PROMEMORIA_GIORNI, CHIAVE_PROMEMORIA_A } from "@/lib/campagne/motore";
import { eseguiDopoRisposta } from "@/lib/automazioni/motore";
import { emailValida, leggiGiorniPromemoria, giorniAllaScadenza, SITUAZIONI } from "@/lib/campagne/regole";
import { nomeGruppo, numeroGruppi } from "@/lib/campagne/abtest";

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
const lista = (fd: FormData, k: string) => fd.getAll(k).filter((x): x is string => typeof x === "string" && !!x.trim());

/** Le campagne le fanno l'amministratore e l'ufficio Marketing. */
export const puoFareCampagne = async (u: ConPermessi | null) => puo(u, "campagne");

async function marketing() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!(await puoFareCampagne(u))) redirect("/campagne?errore=permesso");
  return u;
}
const torna = (id: string, p: Record<string, string>) => redirect(`/campagne/${id}?${new URLSearchParams(p)}`);

export async function creaCampagna(fd: FormData) {
  const u = await marketing();
  const ab = fd.get("ab") === "1";
  const c = await prisma.campagna.create({
    data: { nome: str(fd, "nome") ?? (ab ? "Nuovo A/B test" : "Nuova campagna"), creataDa: u.nome, abTest: ab, ...(ab ? { varianti: { create: [0, 1].map((i) => ({ posizione: i, nome: nomeGruppo(i) })) } } : {}) },
  });
  redirect(`/campagne/${c.id}`);
}

/** Cambia il nome della campagna (dal titolo, in qualsiasi momento). */
export async function rinominaCampagna(fd: FormData) {
  await marketing();
  const id = str(fd, "id"), nome = str(fd, "nome");
  if (!id || !nome) return;
  await prisma.campagna.update({ where: { id }, data: { nome: nome.slice(0, 150) } });
  revalidatePath("/campagne");
  revalidatePath(`/campagne/${id}`);
}

/** Accende o spegne l'A/B test: all'accensione nascono due gruppi con la versione attuale dell'email da cui partire. */
export async function impostaAbTest(fd: FormData) {
  await marketing();
  const id = str(fd, "id");
  if (!id) return;
  const attivo = fd.get("attivo") === "1";
  const c = await prisma.campagna.findUniqueOrThrow({ where: { id }, include: { _count: { select: { varianti: true, invii: true } } } });
  if (!attivo && c._count.invii > 0) torna(id, { errore: "La campagna è già partita divisa in gruppi: per un'email unica duplicala." });
  if (attivo && c._count.varianti === 0) {
    await prisma.campagnaVariante.createMany({ data: [0, 1].map((i) => ({ campagnaId: id, posizione: i, nome: nomeGruppo(i), oggetto: c.oggetto, preheader: c.preheader, formato: c.formato, testo: c.testo, html: c.html })) });
  }
  await prisma.campagna.update({ where: { id }, data: { abTest: attivo } });
  revalidatePath("/campagne");
  torna(id, { ok: attivo ? "A/B test acceso: scegli quanti gruppi e scrivi una versione dell'email per ognuno." : "A/B test spento: si manda un'email unica." });
}

export async function salvaCampagna(fd: FormData) {
  await marketing();
  const id = str(fd, "id");
  if (!id) return;
  const fino = str(fd, "validaFino");
  // template caricato da file: .html/.htm diventa il template HTML, .txt il testo
  let html = typeof fd.get("html") === "string" ? (fd.get("html") as string).trim() : "";
  let testo = (str(fd, "testo") ?? "").slice(0, 8000);
  let formato = str(fd, "formato") === "HTML" ? "HTML" : "TESTO";
  const file = fd.get("file");
  if (file && typeof file === "object" && "text" in file && (file as File).size > 0) {
    const f = file as File;
    if (f.size > 500_000) torna(id, { errore: "Il file è troppo grande (massimo 500 KB): le immagini vanno messe online e richiamate con il loro link." });
    const contenuto = await f.text();
    if (/\.(html?|htm)$/i.test(f.name) || /<html|<body|<table|<div/i.test(contenuto)) { html = contenuto; formato = "HTML"; }
    else { testo = contenuto.slice(0, 8000); formato = "TESTO"; }
  }
  await prisma.campagna.update({
    where: { id },
    data: {
      ...(str(fd, "nome") ? { nome: str(fd, "nome")! } : {}), oggetto: (str(fd, "oggetto") ?? "").slice(0, 200), testo,
      preheader: (str(fd, "preheader") ?? "").slice(0, 200), formato, html: html.slice(0, 300_000), tracciamento: fd.get("tracciamento") === "on",
      marchi: lista(fd, "marchi"), stati: lista(fd, "stati"), categorie: lista(fd, "categorie"),
      provenienza: str(fd, "provenienza"), commercialeId: str(fd, "commercialeId"), provincia: str(fd, "provincia"),
      situazione: SITUAZIONI.some((x) => x.codice === str(fd, "situazione")) ? str(fd, "situazione") : null,
      offerteDal: str(fd, "offerteDal") ? daOraRoma(`${str(fd, "offerteDal")}T00:00`) : null,
      offerteAl: str(fd, "offerteAl") ? daOraRoma(`${str(fd, "offerteAl")}T23:59`) : null,
      richiama: fd.get("richiama") === "on", richiamaTelefonistaId: str(fd, "richiamaTelefonistaId"),
      validaFino: fino ? daOraRoma(`${fino}T12:00`) : null,
      // nuova scadenza: gli avvisi ripartono da capo
      promemoriaInviati: [],
    },
  });
  // A/B test: i gruppi del modulo (numero, nome e versione dell'email di ognuno)
  if (fd.get("gruppi")) {
    const c = await prisma.campagna.findUniqueOrThrow({ where: { id }, include: { varianti: { orderBy: { posizione: "asc" }, include: { _count: { select: { invii: true } } } } } });
    const n = numeroGruppi(fd.get("gruppi"));
    const usati = c.varianti.filter((v) => v._count.invii > 0).length;
    if (n < usati) torna(id, { errore: `La campagna è già partita con ${usati} gruppi: non se ne possono togliere.` });
    for (let i = 0; i < n; i++) {
      const p = `g${i}_`;
      let gHtml = typeof fd.get(`${p}html`) === "string" ? (fd.get(`${p}html`) as string).trim() : "";
      let gTesto = (str(fd, `${p}testo`) ?? "").slice(0, 8000);
      let gFormato = str(fd, `${p}formato`) === "HTML" ? "HTML" : "TESTO";
      const f = fd.get(`${p}file`);
      if (f && typeof f === "object" && "text" in f && (f as File).size > 0) {
        if ((f as File).size > 500_000) torna(id, { errore: `${str(fd, `${p}nome`) ?? nomeGruppo(i)}: il file è troppo grande (massimo 500 KB).` });
        const cont = await (f as File).text();
        if (/\.(html?|htm)$/i.test((f as File).name) || /<html|<body|<table|<div/i.test(cont)) { gHtml = cont; gFormato = "HTML"; } else { gTesto = cont.slice(0, 8000); gFormato = "TESTO"; }
      }
      const dati = { posizione: i, nome: (str(fd, `${p}nome`) ?? nomeGruppo(i)).slice(0, 80), oggetto: (str(fd, `${p}oggetto`) ?? "").slice(0, 200), preheader: (str(fd, `${p}preheader`) ?? "").slice(0, 200), formato: gFormato, testo: gTesto, html: gHtml.slice(0, 300_000) };
      const esistente = c.varianti.find((v) => v.id === str(fd, `${p}id`)) ?? c.varianti[i];
      if (esistente) await prisma.campagnaVariante.update({ where: { id: esistente.id }, data: dati });
      else await prisma.campagnaVariante.create({ data: { ...dati, campagnaId: id } });
    }
    const tieni = (await prisma.campagnaVariante.findMany({ where: { campagnaId: id }, orderBy: { posizione: "asc" } })).slice(0, n).map((v) => v.id);
    await prisma.campagnaVariante.deleteMany({ where: { campagnaId: id, id: { notIn: tieni }, invii: { none: {} } } });
  }
  revalidatePath("/campagne");
  torna(id, { ok: "Campagna salvata." });
}

export async function provaCampagna(fd: FormData) {
  const u = await marketing();
  const id = str(fd, "id");
  if (!id) return;
  const a = str(fd, "a") ?? u.email;
  if (!emailValida(a)) torna(id, { errore: "Scrivi un indirizzo email valido per la prova." });
  const r = await inviaProva(id, a);
  torna(id, r.inviata ? { ok: r.quante && r.quante > 1 ? `${r.quante} email di prova (una per gruppo) inviate a ${a}.` : `Email di prova inviata a ${a}.` } : { errore: `Email di prova non inviata: ${r.motivo ?? "errore"}` });
}

export async function inviaCampagna(fd: FormData) {
  await marketing();
  const id = str(fd, "id");
  if (!id) return;
  const c = await prisma.campagna.findUniqueOrThrow({ where: { id }, include: { varianti: { orderBy: { posizione: "asc" } } } });
  if (c.abTest) {
    if (c.varianti.length < 2) torna(id, { errore: "L'A/B test ha bisogno di almeno 2 gruppi: salva i gruppi prima di inviare." });
    const incompleto = c.varianti.find((v) => !v.oggetto.trim() || !(v.formato === "HTML" ? v.html.trim() : v.testo.trim()));
    if (incompleto) torna(id, { errore: `${incompleto.nome}: scrivi oggetto e testo (o il template HTML) e salva prima di inviare.` });
  }
  const vuota = c.formato === "HTML" ? !c.html.trim() : !c.testo.trim();
  if (!c.abTest && (!c.oggetto.trim() || vuota)) torna(id, { errore: c.formato === "HTML" ? "Scrivi l'oggetto e incolla (o carica) il template HTML, poi salva prima di inviare." : "Scrivi oggetto e testo dell'email e salva prima di inviare." });
  if (c.validaFino && giorniAllaScadenza(c.validaFino, new Date()) < 0) torna(id, { errore: "La campagna è già scaduta: aggiorna la data \"valida fino al\"." });
  const n = await accodaCampagna(id);
  eseguiDopoRisposta();
  revalidatePath("/campagne");
  torna(id, { ok: n ? `Invio avviato: ${n} email in coda, partono a blocchi nei prossimi minuti.` : "Nessun nuovo destinatario: chi rientra nei filtri l'ha già ricevuta." });
}

/** Controlla subito la casella aziendale per le email rimbalzate (di solito lo fa da sola ogni 10 minuti). */
export async function controllaRimbalziOra() {
  const u = await getCurrentUser();
  if (!u || !puo(u, "automazioni")) redirect("/impostazioni/automazioni?errore=permesso");
  const { controllaRimbalzi } = await import("@/lib/mail/rimbalzi-server");
  const e = await controllaRimbalzi({ forza: true });
  revalidatePath("/impostazioni/automazioni");
  redirect(`/impostazioni/automazioni?rimbalzi=${encodeURIComponent(e?.motivo ? `Controllo non riuscito: ${e.motivo}` : `Controllate ${e?.controllati ?? 0} email nuove della casella: ${e?.rimbalzi ?? 0} rimbalzi.`)}#rimbalzi`);
}

export async function duplicaCampagna(fd: FormData) {
  const u = await marketing();
  const id = str(fd, "id");
  if (!id) return;
  const c = await prisma.campagna.findUniqueOrThrow({ where: { id }, include: { varianti: { orderBy: { posizione: "asc" } } } });
  const n = await prisma.campagna.create({
    data: { abTest: c.abTest, varianti: { create: c.varianti.map((v) => ({ posizione: v.posizione, nome: v.nome, oggetto: v.oggetto, preheader: v.preheader, formato: v.formato, testo: v.testo, html: v.html })) }, nome: `${c.nome} (copia)`, oggetto: c.oggetto, testo: c.testo, preheader: c.preheader, formato: c.formato, html: c.html, tracciamento: c.tracciamento, marchi: c.marchi, stati: c.stati, categorie: c.categorie, provenienza: c.provenienza, commercialeId: c.commercialeId, provincia: c.provincia, situazione: c.situazione, offerteDal: c.offerteDal, offerteAl: c.offerteAl, richiama: c.richiama, richiamaTelefonistaId: c.richiamaTelefonistaId, creataDa: u.nome },
  });
  if (fd.get("resta") === "1") { revalidatePath("/campagne"); redirect(`/campagne?ok=${encodeURIComponent(`Creata «${c.nome} (copia)».`)}`); }
  redirect(`/campagne/${n.id}?ok=${encodeURIComponent("Copia creata: aggiorna testo e scadenza, poi invia.")}`);
}

export async function eliminaCampagna(fd: FormData) {
  await marketing();
  const id = str(fd, "id");
  if (!id) return;
  // anche quelle già inviate (richiesta di Rocco): con la campagna vanno via i gruppi, la coda ancora da spedire e le statistiche
  const c = await prisma.campagna.findUnique({ where: { id }, select: { nome: true } });
  await prisma.campagna.deleteMany({ where: { id } });
  revalidatePath("/campagne");
  redirect(`/campagne?ok=${encodeURIComponent(`Campagna «${c?.nome ?? ""}» eliminata.`)}`);
}

/** Impostazioni: giorni degli avvisi di scadenza (es. 3,2,1) e a chi mandarli. */
export async function salvaPromemoriaCampagne(fd: FormData) {
  const u = await getCurrentUser();
  if (!u || !puo(u, "automazioni")) redirect("/impostazioni/automazioni?errore=permesso");
  const giorni = leggiGiorniPromemoria(str(fd, "giorni") ?? "").join(",");
  const a = (str(fd, "a") ?? "").split(/[,;\s]+/).filter(emailValida).join(", ");
  for (const [chiave, valore] of [[CHIAVE_PROMEMORIA_GIORNI, giorni], [CHIAVE_PROMEMORIA_A, a]] as const)
    await prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });
  revalidatePath("/impostazioni/automazioni");
  redirect("/impostazioni/automazioni?promemoria=1");
}
