"use server";

// Impostazioni › Consumo del database: chiave dell'API di Neon, budget, chi riceve gli avvisi, «Aggiorna adesso».
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { aggiornaLettura, controllaConsumi, leggiNeon, salvaConfigConsumi, togliChiaveNeon } from "@/lib/database/consumi-server";

const PAGINA = "/impostazioni/database";
const vai = (p: Record<string, string>): never => redirect(`${PAGINA}?${new URLSearchParams(p)}`);
async function chi() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "database")) vai({ errore: "Solo l'amministratore gestisce il consumo del database" });
}

export async function salvaConsumi(fd: FormData) {
  await chi();
  const apiKey = String(fd.get("apiKey") ?? "").trim();
  const progetto = String(fd.get("progetto") ?? "").trim();
  const budget = Number(String(fd.get("budget") ?? "").replace(",", "."));
  if (apiKey) {
    // prova subito: una chiave che Neon rifiuta non si salva
    const r = await leggiNeon(apiKey, progetto || undefined);
    if (!r.ok) vai({ errore: `Chiave non salvata: ${r.motivo}` });
  }
  await salvaConfigConsumi({ apiKey: apiKey || null, progetto, budget: Number.isFinite(budget) && budget > 0 ? budget : undefined, piano: String(fd.get("piano") ?? "LAUNCH"), destinatari: String(fd.get("destinatari") ?? "") });
  if (apiKey) await aggiornaLettura();
  revalidatePath(PAGINA);
  vai({ ok: apiKey ? "Chiave di Neon collegata: i consumi si aggiornano da soli ogni ora." : "Impostazioni salvate." });
}

export async function aggiornaConsumi() {
  await chi();
  const r = await controllaConsumi({ forza: true });
  revalidatePath(PAGINA);
  if ("errore" in r && r.errore) vai({ errore: r.errore });
  vai({ ok: "Consumi aggiornati adesso." });
}

export async function scollegaNeon() {
  await chi();
  await togliChiaveNeon();
  revalidatePath(PAGINA);
  vai({ ok: "Chiave di Neon tolta." });
}
