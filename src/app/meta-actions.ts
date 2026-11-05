"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { prisma } from "@/lib/prisma";
import { aggiornaModulo, marchioDaNome, pulisciCatalogo, spiegaErrore, type CatalogoMeta } from "@/lib/meta/moduli";
import { catalogo, cfgConModuli, chiediAlGateway, importaLeadDaGraph, moduliCollegati, pagineCollegate, salvaCatalogo, salvaIndirizzoGateway, salvaModuli, salvaPagine } from "@/lib/meta/moduli-server";
import { loadMetaConfig } from "@/lib/meta/config";
import { eseguiDopoRisposta } from "@/lib/automazioni/motore";
import type { GraphLead } from "@/lib/meta/types";

const PAGINA = "/impostazioni/lead";
const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };
const vai = (p: { ok?: string; errore?: string }): never => {
  const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]);
  redirect(`${PAGINA}?${q}#meta`);
};

/** Chi collega i moduli: amministratore e marketing (permesso «pubblicità»). */
async function gestore() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "pubblicita")) vai({ errore: "Solo amministratore e marketing possono collegare i moduli." });
  return u!;
}

/** Collega / scollega un modulo e ne sceglie il marchio. */
export async function collegaModuloMeta(fd: FormData) {
  const u = await gestore();
  const formId = str(fd, "formId");
  if (!/^\d{5,25}$/.test(formId)) vai({ errore: "ID del modulo non valido: sono solo numeri (lo trovi in Meta, Moduli istantanei)." });
  const brand = str(fd, "brand");
  if (brand && !(await prisma.brand.findFirst({ where: { nome: brand } }))) vai({ errore: `Marchio «${brand}» non trovato.` });
  const attivo = str(fd, "attivo") !== "0";
  const lista = await moduliCollegati();
  const prima = lista.find((m) => m.formId === formId);
  const nome = str(fd, "nome") || prima?.nome || `Modulo ${formId}`;
  await salvaModuli(aggiornaModulo(lista, { formId, nome: nome.slice(0, 200), pageId: str(fd, "pageId") || prima?.pageId || null, brand: brand || null, attivo, da: u.nome, il: new Date().toISOString() }));
  revalidatePath(PAGINA);
  vai({ ok: attivo ? `«${nome}» collegato: i nuovi lead arriveranno in P&C ONE${brand ? ` come ${brand}` : ""}.` : `«${nome}» scollegato: i suoi lead non entrano più.` });
}

/** Rilegge da Meta (tramite il gateway) i moduli di tutte le pagine. */
export async function aggiornaElencoMeta() {
  await gestore();
  const r = await chiediAlGateway<{ catalogo?: unknown; gateway_url?: unknown }>({ azione: "catalogo" });
  if (!r.ok) vai({ errore: r.errore });
  const c = pulisciCatalogo((r as { dati: { catalogo?: unknown } }).dati.catalogo) as CatalogoMeta | null;
  if (!c) vai({ errore: "Il gateway ha risposto in modo inatteso." });
  await salvaCatalogo(c!);
  await salvaIndirizzoGateway((r as { dati: { gateway_url?: unknown } }).dati.gateway_url);
  revalidatePath(PAGINA);
  const n = c!.pagine.reduce((t, p) => t + p.moduli.length, 0);
  vai({ ok: `Elenco aggiornato da Meta: ${n} moduli su ${c!.pagine.length} pagine.` });
}

/** Recupera i lead degli ultimi giorni di un modulo (es. appena collegato, o arrivati quando non era collegato). */
export async function recuperaLeadModuloMeta(fd: FormData) {
  await gestore();
  const formId = str(fd, "formId");
  const giorni = Math.min(90, Math.max(1, Number(str(fd, "giorni")) || 7));
  if (!/^\d{5,25}$/.test(formId)) vai({ errore: "ID del modulo non valido." });
  const cfg = await cfgConModuli();
  if (!cfg.allowedFormIds.includes(formId)) vai({ errore: "Prima collega il modulo, poi recupera i lead." });
  const pageId = (await catalogo())?.pagine.find((p) => p.moduli.some((m) => m.id === formId))?.id;
  const r = await chiediAlGateway<{ leads?: GraphLead[] }>({ azione: "lead", form_id: formId, giorni, page_id: pageId }, 55_000);
  if (!r.ok) vai({ errore: `Lead non recuperati: ${spiegaErrore((r as { errore: string }).errore) || (r as { errore: string }).errore}` });
  const leads = ((r as { dati: { leads?: GraphLead[] } }).dati.leads ?? []).filter((l) => l && typeof l.id === "string" && Array.isArray(l.field_data));
  const brand = cfg.formBrands[formId] ?? (pageId ? cfg.pageBrands[pageId] : undefined) ?? cfg.defaultBrand;
  const esito = await importaLeadDaGraph(leads, formId, brand);
  if (esito.nuovi) eseguiDopoRisposta();
  revalidatePath(PAGINA);
  revalidatePath("/lead");
  vai({ ok: `Ultimi ${giorni} giorni: ${leads.length} lead in Meta · ${esito.nuovi} nuovi in P&C ONE · ${esito.gia} c'erano già${esito.scartati ? ` · ${esito.scartati} senza telefono/email` : ""}.` });
}

/** Chiave incollata (generata nello strumento di Meta): il gateway ne ricava le chiavi senza scadenza delle pagine, salvate cifrate. */
export async function collegaChiaveMeta(fd: FormData) {
  const u = await gestore();
  const token = str(fd, "chiave").replace(/\s+/g, "");
  if (token.length < 20) vai({ errore: "Incolla la chiave copiata da Meta (è un testo lungo)." });
  const r = await chiediAlGateway<{ pagine?: { id: string; nome: string; token: string }[]; lunga?: boolean }>({ azione: "chiave", token });
  if (!r.ok) vai({ errore: `Chiave non accettata: ${spiegaErrore((r as { errore: string }).errore) || (r as { errore: string }).errore}` });
  const pagine = ((r as { dati: { pagine?: { id: string; nome: string; token: string }[] } }).dati.pagine ?? []).filter((p) => /^\d+$/.test(p.id) && p.token);
  if (!pagine.length) vai({ errore: "La chiave non dà accesso a nessuna pagina." });
  const env = loadMetaConfig();
  const marchi = (await prisma.brand.findMany({ select: { nome: true } })).map((b) => b.nome);
  const gia = new Map((await pagineCollegate()).map((p) => [p.id, p]));
  await salvaPagine(pagine.map((p) => ({ id: p.id, nome: p.nome, tokenChiaro: p.token, brand: gia.get(p.id)?.brand ?? env.pageBrands[p.id] ?? marchioDaNome(p.nome, marchi, env.defaultBrand) })));
  revalidatePath(PAGINA);
  void u;
  vai({ ok: `Chiave salvata per ${pagine.length} ${pagine.length === 1 ? "pagina" : "pagine"}: ${pagine.map((p) => p.nome).join(", ")}. Tra un minuto premi «Aggiorna l'elenco da Meta».` });
}

/** Attiva l'arrivo dei lead di una pagina (iscrizione dell'app alla pagina su Meta). */
export async function attivaLeadPaginaMeta(fd: FormData) {
  await gestore();
  const pageId = str(fd, "pageId");
  if (!/^\d+$/.test(pageId)) vai({ errore: "Pagina non valida." });
  const r = await chiediAlGateway({ azione: "iscrivi", page_id: pageId });
  if (!r.ok) vai({ errore: (r as { errore: string }).errore === "chiave_pagina_mancante" ? "Prima incolla la chiave di Meta che comprende questa pagina." : `Non attivato: ${spiegaErrore((r as { errore: string }).errore) || (r as { errore: string }).errore}` });
  revalidatePath(PAGINA);
  vai({ ok: "Arrivo dei lead attivato per la pagina: tra 5 minuti l'elenco lo conferma. Fai un lead di prova." });
}

/** Marchio di base di una pagina collegata (i suoi moduli lo propongono quando si collegano). */
export async function marchioPaginaMeta(fd: FormData) {
  await gestore();
  const pageId = str(fd, "pageId");
  const brand = str(fd, "brand");
  const p = (await pagineCollegate()).find((x) => x.id === pageId);
  if (!p || !(await prisma.brand.findFirst({ where: { nome: brand } }))) vai({ errore: "Pagina o marchio non validi." });
  await salvaPagine([{ ...p!, brand }]);
  revalidatePath(PAGINA);
  vai({ ok: `Pagina ${p!.nome}: marchio di base ${brand}.` });
}
