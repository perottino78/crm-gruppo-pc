"use server";

// Registro «chi ha fatto cosa» e cestino: ripristino di quanto eliminato (permesso «registro», di serie solo l'amministratore).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { ripristina } from "@/lib/cestino";

export async function ripristinaDalCestino(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "registro")) redirect("/impostazioni");
  const id = String(fd.get("id") ?? "");
  const r = await ripristina(id, u);
  revalidatePath("/impostazioni/registro");
  revalidatePath("/campagne"); revalidatePath("/clienti"); revalidatePath("/lead");
  redirect(`/impostazioni/registro?${new URLSearchParams(r.ok ? { ok: `«${r.nome}» ripristinato.` } : { errore: r.errore })}`);
}
