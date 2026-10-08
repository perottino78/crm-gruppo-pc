"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { setConfig } from "@/lib/leadIngest";

async function soloAdmin() {
  const u = await getCurrentUser();
  if (!isAmministratore(u)) throw new Error("Non autorizzato");
}

export async function rigeneraChiaveLead() {
  await soloAdmin();
  await setConfig("lead_api_key", randomBytes(18).toString("hex"));
  revalidatePath("/impostazioni/lead");
}

export async function salvaMetaLead(fd: FormData) {
  await soloAdmin();
  for (const k of ["meta_verify_token", "meta_page_token", "meta_brand"]) {
    const v = String(fd.get(k) ?? "").trim();
    if (v) await setConfig(k, v);
  }
  revalidatePath("/impostazioni/lead");
}
