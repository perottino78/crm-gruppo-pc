import type { PrismaClient } from "@prisma/client";
import type { DeliveryRow, DeliveryStato, DownstreamRow, DownstreamStato, InboundStore, LeadgenEvent, MetaStore, Origine } from "./types";

// Nessun import con alias "@/": il file è condiviso con il gateway (progetto separato).
export type MetaPrisma = Pick<PrismaClient, "metaDelivery" | "metaDownstream">;
export type InboundPrisma = Pick<PrismaClient, "metaInboundEvent">;

type RawDelivery = { stato: string; origine: string } & Omit<DeliveryRow, "stato" | "origine">;
const toDelivery = (r: RawDelivery): DeliveryRow => ({ ...r, stato: r.stato as DeliveryStato, origine: r.origine as Origine });
type RawDown = { stato: string } & Omit<DownstreamRow, "stato">;
const toDownstream = (r: RawDown): DownstreamRow => ({ ...r, stato: r.stato as DownstreamStato });

export function makePrismaMetaStore(db: MetaPrisma): MetaStore {
  return {
    async upsertReceived(ev: LeadgenEvent, eventJson, now, origine = "META") {
      const existing = await db.metaDelivery.findUnique({ where: { leadgenId: ev.leadgenId } });
      if (existing) return { id: existing.id, stato: existing.stato as DeliveryStato, isNew: false };
      try {
        const c = await db.metaDelivery.create({
          data: {
            leadgenId: ev.leadgenId,
            pageId: ev.pageId,
            formId: ev.formId,
            adId: ev.adId ?? null,
            adgroupId: ev.adgroupId ?? null,
            createdTimeMeta: ev.createdTime ? new Date(ev.createdTime * 1000) : null,
            origine,
            eventJson,
            receivedAt: now,
          },
        });
        return { id: c.id, stato: "RECEIVED", isNew: true };
      } catch {
        // Due retry di Meta in parallelo: la riga esiste già (vincolo unico su leadgenId).
        const again = await db.metaDelivery.findUniqueOrThrow({ where: { leadgenId: ev.leadgenId } });
        return { id: again.id, stato: again.stato as DeliveryStato, isNew: false };
      }
    },

    // Claim atomico: UPDATE condizionale, un solo vincitore anche con richieste concorrenti.
    async claim(id, staleBefore) {
      const r = await db.metaDelivery.updateMany({
        where: {
          id,
          OR: [{ stato: "RECEIVED" }, { stato: "FAILED", retriabile: true }, { stato: "PROCESSING", updatedAt: { lt: staleBefore } }],
        },
        data: { stato: "PROCESSING", tentativi: { increment: 1 }, nextRetryAt: null },
      });
      if (r.count !== 1) return null;
      return toDelivery((await db.metaDelivery.findUniqueOrThrow({ where: { id } })) as RawDelivery);
    },

    async saveLead(id, leadJson) { await db.metaDelivery.update({ where: { id }, data: { leadJson } }); },
    async markProcessed(id, leadId) { await db.metaDelivery.update({ where: { id }, data: { stato: "PROCESSED", leadId, erroreCodice: null, nextRetryAt: null } }); },
    async markFailed(id, code, retriabile, nextRetryAt) { await db.metaDelivery.update({ where: { id }, data: { stato: "FAILED", erroreCodice: code, retriabile, nextRetryAt } }); },

    async ensureDownstreams(deliveryId, names) {
      // INSERT ... ON CONFLICT DO NOTHING: sicuro con chiamate concorrenti (l'upsert Prisma non lo è).
      await db.metaDownstream.createMany({ data: names.map((destinatario) => ({ deliveryId, destinatario })), skipDuplicates: true });
    },
    async getDownstreams(deliveryId) { return (await db.metaDownstream.findMany({ where: { deliveryId } })).map((r) => toDownstream(r as RawDown)); },

    async listRetryableDeliveries(receivedBefore, staleBefore, limit) {
      const rows = await db.metaDelivery.findMany({
        where: {
          OR: [
            { stato: "RECEIVED", receivedAt: { lt: receivedBefore } },
            { stato: "FAILED", retriabile: true, nextRetryAt: { lte: new Date() } },
            { stato: "PROCESSING", updatedAt: { lt: staleBefore } },
          ],
        },
        orderBy: { receivedAt: "asc" },
        take: limit,
        select: { id: true },
      });
      return rows.map((r) => r.id);
    },

    async listDueDownstreams(now, limit) {
      const rows = await db.metaDownstream.findMany({
        where: {
          delivery: { stato: "PROCESSED" },
          OR: [
            { stato: "PENDING", OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
            { stato: "FAILED", retriabile: true, nextRetryAt: { lte: now } },
          ],
        },
        include: { delivery: true },
        orderBy: { updatedAt: "asc" },
        take: limit,
      });
      return rows.map((r) => {
        const { delivery, ...row } = r;
        return { row: toDownstream(row as RawDown), delivery: toDelivery(delivery as RawDelivery) };
      });
    },

    async claimDownstream(id, now, leaseMs) {
      const r = await db.metaDownstream.updateMany({
        where: {
          id,
          OR: [
            { stato: "PENDING", OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
            { stato: "FAILED", retriabile: true, nextRetryAt: { lte: now } },
          ],
        },
        data: { tentativi: { increment: 1 }, nextRetryAt: new Date(now.getTime() + leaseMs) },
      });
      if (r.count !== 1) return null;
      return (await db.metaDownstream.findUniqueOrThrow({ where: { id } })).tentativi;
    },
    async markDownstreamDelivered(id) { await db.metaDownstream.update({ where: { id }, data: { stato: "DELIVERED", deliveredAt: new Date(), erroreCodice: null, nextRetryAt: null } }); },
    async markDownstreamFailed(id, code, retriabile, nextRetryAt) { await db.metaDownstream.update({ where: { id }, data: { stato: "FAILED", erroreCodice: code, retriabile, nextRetryAt } }); },

    async requeueDeliveries(now) {
      const r = await db.metaDelivery.updateMany({ where: { stato: "FAILED", retriabile: false }, data: { retriabile: true, tentativi: 0, nextRetryAt: now } });
      return r.count;
    },
    async requeueDownstreams(now, destinatario) {
      const r = await db.metaDownstream.updateMany({
        where: { stato: "FAILED", retriabile: false, ...(destinatario ? { destinatario } : {}) },
        data: { retriabile: true, tentativi: 0, nextRetryAt: now },
      });
      return r.count;
    },

    async stats() {
      const d = await db.metaDelivery.groupBy({ by: ["stato"], _count: true });
      const s = await db.metaDownstream.groupBy({ by: ["destinatario", "stato"], _count: true });
      return {
        deliveries: Object.fromEntries(d.map((x) => [x.stato, x._count])),
        downstreams: s.map((x) => ({ destinatario: x.destinatario, stato: x.stato, count: x._count })),
      };
    },
  };
}

export function makePrismaInboundStore(db: InboundPrisma): InboundStore {
  return {
    async record(i, now) {
      const ex = await db.metaInboundEvent.findUnique({ where: { eventId: i.eventId } });
      if (ex) return { isNew: false, mode: ex.mode, leadId: ex.leadId };
      try {
        await db.metaInboundEvent.create({ data: { ...i, receivedAt: now } });
        return { isNew: true, mode: i.mode, leadId: null };
      } catch {
        const again = await db.metaInboundEvent.findUniqueOrThrow({ where: { eventId: i.eventId } });
        return { isNew: false, mode: again.mode, leadId: again.leadId };
      }
    },
    async attachLead(eventId, leadId) { await db.metaInboundEvent.update({ where: { eventId }, data: { leadId } }); },
  };
}
