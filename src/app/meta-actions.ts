"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { prisma } from "@/lib/prisma";
import { aggiornaModulo, pulisciCatalogo, type CatalogoMeta } from "@/lib/meta/moduli";
import { catalogo, cfgConModuli, chiediAlGateway, importaLeadDaGraph, moduliCollegati, salvaCatalogo, salvaIndirizzoGateway, salvaModuli } from "@/lib/meta/moduli-server";
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
  const r = await chiediAlGateway<{ leads?: GraphLead[] }>({ azione: "lead", form_id: formId, giorni }, 55_000);
  if (!r.ok) vai({ errore: `Lead non recuperati: ${r.errore}` });
  const leads = ((r as { dati: { leads?: GraphLead[] } }).dati.leads ?? []).filter((l) => l && typeof l.id === "string" && Array.isArray(l.field_data));
  const pageId = (await catalogo())?.pagine.find((p) => p.moduli.some((m) => m.id === formId))?.id;
  const brand = cfg.formBrands[formId] ?? (pageId ? cfg.pageBrands[pageId] : undefined) ?? cfg.defaultBrand;
  const esito = await importaLeadDaGraph(leads, formId, brand);
  if (esito.nuovi) eseguiDopoRisposta();
  revalidatePath(PAGINA);
  revalidatePath("/lead");
  vai({ ok: `Ultimi ${giorni} giorni: ${leads.length} lead in Meta · ${esito.nuovi} nuovi in P&C ONE · ${esito.gia} c'erano già${esito.scartati ? ` · ${esito.scartati} senza telefono/email` : ""}.` });
}
