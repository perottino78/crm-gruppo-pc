import { prisma } from "@/lib/prisma";
import type { DeliveryRow, DeliveryStato, DownstreamRow, DownstreamStato, LeadgenEvent, MetaStore } from "./types";

type Raw = Awaited<ReturnType<typeof prisma.metaDelivery.findUniqueOrThrow>>;
const toDelivery = (r: Raw): DeliveryRow => ({ ...r, stato: r.stato as DeliveryStato });
const toDownstream = (r: { stato: string } & Omit<DownstreamRow, "stato">): DownstreamRow => ({ ...r, stato: r.stato as DownstreamStato });

export const prismaMetaStore: MetaStore = {
  async upsertReceived(ev: LeadgenEvent, eventJson, now) {
    const existing = await prisma.metaDelivery.findUnique({ where: { leadgenId: ev.leadgenId } });
    if (existing) return { id: existing.id, stato: existing.stato as DeliveryStato, isNew: false };
    try {
      const c = await prisma.metaDelivery.create({
        data: {
          leadgenId: ev.leadgenId,
          pageId: ev.pageId,
          formId: ev.formId,
          adId: ev.adId ?? null,
          adgroupId: ev.adgroupId ?? null,
          createdTimeMeta: ev.createdTime ? new Date(ev.createdTime * 1000) : null,
          eventJson,
          receivedAt: now,
        },
      });
      return { id: c.id, stato: "RECEIVED", isNew: true };
    } catch {
      // Corsa tra due retry di Meta: la riga esiste già.
      const again = await prisma.metaDelivery.findUniqueOrThrow({ where: { leadgenId: ev.leadgenId } });
      return { id: again.id, stato: again.stato as DeliveryStato, isNew: false };
    }
  },

  async claim(id, staleBefore) {
    const r = await prisma.metaDelivery.updateMany({
      where: {
        id,
        OR: [
          { stato: "RECEIVED" },
          { stato: "FAILED", retriabile: true },
          { stato: "PROCESSING", updatedAt: { lt: staleBefore } },
        ],
      },
      data: { stato: "PROCESSING", tentativi: { increment: 1 }, nextRetryAt: null },
    });
    if (r.count !== 1) return null;
    return toDelivery(await prisma.metaDelivery.findUniqueOrThrow({ where: { id } }));
  },

  async saveLead(id, leadJson) {
    await prisma.metaDelivery.update({ where: { id }, data: { leadJson } });
  },
  async markProcessed(id, leadId) {
    await prisma.metaDelivery.update({ where: { id }, data: { stato: "PROCESSED", leadId, erroreCodice: null, nextRetryAt: null } });
  },
  async markFailed(id, code, retriabile, nextRetryAt) {
    await prisma.metaDelivery.update({ where: { id }, data: { stato: "FAILED", erroreCodice: code, retriabile, nextRetryAt } });
  },

  async ensureDownstreams(deliveryId, names) {
    for (const destinatario of names) {
      await prisma.metaDownstream.upsert({
        where: { deliveryId_destinatario: { deliveryId, destinatario } },
        update: {},
        create: { deliveryId, destinatario },
      });
    }
  },
  async getDownstreams(deliveryId) {
    return (await prisma.metaDownstream.findMany({ where: { deliveryId } })).map(toDownstream);
  },

  async listRetryableDeliveries(receivedBefore, staleBefore, limit) {
    const now = new Date();
    const rows = await prisma.metaDelivery.findMany({
      where: {
        OR: [
          { stato: "RECEIVED", receivedAt: { lt: receivedBefore } },
          { stato: "FAILED", retriabile: true, nextRetryAt: { lte: now } },
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
    const rows = await prisma.metaDownstream.findMany({
      where: {
        delivery: { stato: "PROCESSED" },
        OR: [
          { stato: "PENDING", OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
          { stato: "FAILED", retriabile: true, nextRetryAt: { lte: now } },
        ],
      },
      include: { delivery: true },
      take: limit,
    });
    return rows.map((r) => {
      const { delivery, ...row } = r;
      return { row: toDownstream(row), delivery: toDelivery(delivery) };
    });
  },

  async bumpDownstreamAttempt(id) {
    const r = await prisma.metaDownstream.update({ where: { id }, data: { tentativi: { increment: 1 } } });
    return r.tentativi;
  },
  async markDownstreamDelivered(id) {
    await prisma.metaDownstream.update({ where: { id }, data: { stato: "DELIVERED", deliveredAt: new Date(), erroreCodice: null, nextRetryAt: null } });
  },
  async markDownstreamFailed(id, code, retriabile, nextRetryAt) {
    await prisma.metaDownstream.update({ where: { id }, data: { stato: "FAILED", erroreCodice: code, retriabile, nextRetryAt } });
  },
};
