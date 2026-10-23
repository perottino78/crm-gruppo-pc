import { registraLead } from "@/lib/leadIngest";
import type { LeadSink } from "./types";

export const prismaLeadSink: LeadSink = {
  async ingest(i) {
    try {
      const r = await registraLead({
        nome: i.nome,
        telefono: i.telefono,
        email: i.email,
        brand: i.brand,
        fonte: "facebook",
        note: i.note,
        externalId: i.externalId,
        metaFormId: i.formId,
        metaAdId: i.adId,
      });
      if (!r) return { ok: false, retriable: false, code: "lead_senza_contatto" };
      return { ok: true, leadId: r.id, duplicate: r.duplicato };
    } catch {
      return { ok: false, retriable: true, code: "db_error" };
    }
  },
};
