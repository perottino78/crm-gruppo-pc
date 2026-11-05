"use server";
import { redirect } from "next/navigation";

import { puo } from "@/lib/permessi/catalogo";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { puoMarketing } from "@/lib/utenti/stato";
import { setConfig } from "@/lib/leadIngest";
import { prisma } from "@/lib/prisma";

async function soloAdmin() {
  const u = await getCurrentUser();
  if (!puo(u, "pubblicita")) throw new Error("Non autorizzato");
}

export async function rigeneraChiaveLead() {
  await soloAdmin();
  await setConfig("lead_api_key", randomBytes(18).toString("hex"));
  revalidatePath("/impostazioni/lead");
}

export async function impostaTelefonistaBrand(formData: FormData) {
  // amministratore o marketing (chi gestisce i lead da pubblicità)
  const u = await getCurrentUser();
  if (!u || !puo(u, "pubblicita")) redirect("/impostazioni");
  const brands = await prisma.brand.findMany();
  for (const b of brands) {
    const val = formData.get(`tel_brand_${b.id}`) as string | null;
    if (val === "") {
      // rimuove configurazione esplicita (torna al fallback automatico)
      await prisma.configurazione.deleteMany({ where: { chiave: `lead_telefonista_${b.id}` } });
    } else if (val) {
      await setConfig(`lead_telefonista_${b.id}`, val);
    }
  }
  revalidatePath("/impostazioni/lead");
  redirect(`/impostazioni/lead?ok=${encodeURIComponent("Telefoniste salvate: i prossimi lead arriveranno a loro")}#telefoniste`);
}
