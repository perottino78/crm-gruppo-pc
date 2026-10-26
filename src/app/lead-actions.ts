"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { setConfig } from "@/lib/leadIngest";
import { prisma } from "@/lib/prisma";

async function soloAdmin() {
  const u = await getCurrentUser();
  if (!isAmministratore(u)) throw new Error("Non autorizzato");
}

export async function rigeneraChiaveLead() {
  await soloAdmin();
  await setConfig("lead_api_key", randomBytes(18).toString("hex"));
  revalidatePath("/impostazioni/lead");
}

export async function impostaTelefonistaBrand(formData: FormData) {
  await soloAdmin();
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
}
