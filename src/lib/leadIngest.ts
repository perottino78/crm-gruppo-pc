import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { BRANDS } from "@/lib/brands";

export function slugBrand(nome: string): string {
  return nome.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const BRAND_SLUGS = BRANDS.map((b) => ({ slug: slugBrand(b.nome), nome: b.nome }));

export async function getConfig(chiave: string): Promise<string | null> {
  const c = await prisma.configurazione.findUnique({ where: { chiave } });
  return c?.valore ?? null;
}

export async function setConfig(chiave: string, valore: string) {
  await prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });
}

// Chiave segreta per i collegamenti esterni (Zapier/Make/Meta). Generata al primo uso.
export async function getLeadKey(): Promise<string> {
  const k = await getConfig("lead_api_key");
  if (k) return k;
  const nuova = randomBytes(18).toString("hex");
  await setConfig("lead_api_key", nuova);
  return nuova;
}

export async function brandIdDaNome(nomeOSlug?: string | null): Promise<string | null> {
  const brands = await prisma.brand.findMany();
  if (nomeOSlug) {
    const q = nomeOSlug.trim().toLowerCase();
    const b = brands.find((x) => x.nome.toLowerCase() === q || slugBrand(x.nome) === slugBrand(q));
    if (b) return b.id;
  }
  const pc = brands.find((x) => x.nome === "P&C") ?? brands[0];
  return pc?.id ?? null;
}

function normTel(t?: string | null) {
  return (t ?? "").replace(/[^0-9]/g, "").replace(/^(0039|39)/, "");
}

export type DatiLead = {
  nome: string;
  telefono?: string | null;
  email?: string | null;
  brand?: string | null;
  fonte?: string | null;
  note?: string | null;
};

// Crea il lead evitando doppioni (stesso telefono o email negli ultimi 30 giorni).
export async function registraLead(d: DatiLead): Promise<{ id: string; duplicato: boolean } | null> {
  const nome = (d.nome ?? "").trim().slice(0, 200);
  const telefono = (d.telefono ?? "").trim().slice(0, 40) || null;
  const email = (d.email ?? "").trim().toLowerCase().slice(0, 200) || null;
  if (!nome || (!telefono && !email)) return null;
  const brandId = await brandIdDaNome(d.brand);
  if (!brandId) return null;

  const da = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const recenti = await prisma.lead.findMany({ where: { createdAt: { gte: da }, brandId } });
  const tn = normTel(telefono);
  const dup = recenti.find((l) => (tn && normTel(l.telefono) === tn) || (email && l.email?.toLowerCase() === email));
  if (dup) {
    if (d.note) {
      await prisma.lead.update({
        where: { id: dup.id },
        data: { note: `${dup.note ?? ""}\n[${new Date().toLocaleDateString("it-IT")}] Nuova richiesta: ${d.note}`.trim() },
      });
    }
    return { id: dup.id, duplicato: true };
  }
  const l = await prisma.lead.create({
    data: {
      nome,
      telefono,
      email,
      brandId,
      fonte: (d.fonte ?? "facebook").trim().slice(0, 60) || "facebook",
      note: d.note?.trim().slice(0, 2000) || null,
    },
  });
  return { id: l.id, duplicato: false };
}
