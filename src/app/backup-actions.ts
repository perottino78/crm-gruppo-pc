"use server";

// Impostazioni › Backup sul NAS: crea o cambia la chiave. La chiave torna in chiaro solo in questa risposta.
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { creaChiaveBackup, salvaFrequenzaBackup } from "@/lib/backup/server";
import { FREQUENZE, frequenza } from "@/lib/backup/regole";
import { prisma } from "@/lib/prisma";

export type StatoChiave = { chiave?: string; errore?: string };

export async function generaChiaveBackup(_prima: StatoChiave, fd: FormData): Promise<StatoChiave> {
  const u = await getCurrentUser();
  if (!u || !puo(u, "backup")) return { errore: "Solo l'amministratore imposta il backup." };
  if (fd.get("conferma") !== "1") return { errore: "Spunta la conferma." };
  const chiave = await creaChiaveBackup();
  await prisma.registroAmministrazione.create({ data: { entita: "BACKUP", entitaId: "nas", azione: "CHIAVE", dettaglio: "Nuova chiave per il backup sul NAS (quella di prima non vale più)", utenteNome: u.nome ?? null } }).catch(() => null);
  revalidatePath("/impostazioni/backup");
  return { chiave };
}

/** Ogni notte o una volta a settimana: il NAS chiama ogni notte e P&C ONE gli dice se tocca. */
export async function salvaFrequenza(fd: FormData) {
  const u = await getCurrentUser();
  if (!u || !puo(u, "backup")) return;
  const f = frequenza(String(fd.get("frequenza") ?? ""));
  await salvaFrequenzaBackup(f);
  await prisma.registroAmministrazione.create({ data: { entita: "BACKUP", entitaId: "nas", azione: "FREQUENZA", dettaglio: FREQUENZE[f], utenteNome: u.nome ?? null } }).catch(() => null);
  revalidatePath("/impostazioni/backup");
}
