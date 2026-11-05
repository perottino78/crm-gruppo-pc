import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { configPresence, loadMetaConfig } from "@/lib/meta/config";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";

// Diagnostica in sola lettura del collegamento Meta: da dove arrivano i lead, quali moduli. Mai dati personali né segreti.
export async function GET(req: NextRequest) {
  const key = req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key");
  if (key !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cfg = loadMetaConfig();
  const dal = new Date(Date.now() - 60 * 86400_000);
  const [consegne, inbound, perForm, perFonte, ultimo] = await Promise.all([
    prisma.metaDelivery.groupBy({ by: ["origine", "stato", "formId"], _count: true, _max: { receivedAt: true } }),
    prisma.metaInboundEvent.groupBy({ by: ["mode", "formId", "pageId"], _count: true, _max: { receivedAt: true } }),
    prisma.lead.groupBy({ by: ["metaFormId"], where: { createdAt: { gte: dal } }, _count: true, _max: { createdAt: true } }),
    prisma.lead.groupBy({ by: ["fonte"], where: { createdAt: { gte: dal } }, _count: true, _max: { createdAt: true } }),
    prisma.lead.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, fonte: true, metaFormId: true } }),
  ]);
  return NextResponse.json({
    variabili: configPresence().filter((v) => v.set).map((v) => v.name),
    config: {
      pageIds: cfg.pageIds, allowedFormIds: cfg.allowedFormIds, formBrands: cfg.formBrands, pageBrands: cfg.pageBrands, defaultBrand: cfg.defaultBrand,
      inboundMode: cfg.inboundMode, localIngest: cfg.localIngest, pollEnabled: cfg.pollEnabled, graphVersion: cfg.graphVersion, downstreams: cfg.downstreams.map((d) => d.name),
    },
    consegne, inbound, leadPerModulo60gg: perForm, leadPerFonte60gg: perFonte, ultimoLead: ultimo,
  });
}
