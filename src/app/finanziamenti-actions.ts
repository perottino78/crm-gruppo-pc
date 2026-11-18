"use server";

// Tabelle di finanziamento modificabili (Impostazioni › Finanziamenti): amministratore o chi ha il permesso «amministrazione».
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { leggiTabelleFinanziamento, salvaTabelleFinanziamento as scrivi, CHIAVE_TABELLE } from "@/lib/finanziamenti/server";
import { TABELLE_PREDEFINITE, normalizzaTabella } from "@/lib/finanziamenti/tabelle";
import { prisma } from "@/lib/prisma";

const PAGINA = "/impostazioni/finanziamenti";
const esito = (k: "ok" | "errore", m: string) => redirect(`${PAGINA}?${k}=${encodeURIComponent(m)}`);

async function autorizzato() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!(u.ruolo === "AMMINISTRATORE" || puo(u, "amministrazione"))) esito("errore", "Non hai il permesso di modificare i finanziamenti.");
}

const campi = (fd: FormData) => Object.fromEntries(["id", "nome", "importoMin", "importoMax", "rateDa", "rateA", "giorniPrimaRata", "tan", "tassoRendimento"].map((k) => [k, fd.get(k)]));

/** Salva una tabella esistente (con id) oppure ne aggiunge una nuova (senza id). */
export async function salvaTabellaFinanziamento(fd: FormData) {
  await autorizzato();
  const t = normalizzaTabella(campi(fd));
  if (typeof t === "string") return esito("errore", t);
  const lista = await leggiTabelleFinanziamento();
  const i = lista.findIndex((x) => x.id === t.id);
  if (i >= 0) lista[i] = t; else lista.push(t);
  await scrivi(lista);
  revalidatePath(PAGINA);
  esito("ok", i >= 0 ? "Tabella salvata." : "Tabella aggiunta.");
}

export async function eliminaTabellaFinanziamento(fd: FormData) {
  await autorizzato();
  const id = String(fd.get("id") ?? "");
  const lista = (await leggiTabelleFinanziamento()).filter((x) => x.id !== id);
  await scrivi(lista);
  revalidatePath(PAGINA);
  esito("ok", "Tabella eliminata. Le offerte che la usavano già non la mostrano più.");
}

export async function ripristinaTabelleFinanziamento() {
  await autorizzato();
  await prisma.configurazione.deleteMany({ where: { chiave: CHIAVE_TABELLE } });
  revalidatePath(PAGINA);
  esito("ok", `Ripristinate le ${TABELLE_PREDEFINITE.length} tabelle del simulatore.`);
}
