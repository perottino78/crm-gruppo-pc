import { PrismaClient } from "../generated/client";
import { loadMetaConfig } from "../../src/lib/meta/config";
import { consoleLogger } from "../../src/lib/meta/log";
import { makePrismaMetaStore, type MetaPrisma } from "../../src/lib/meta/prismaStoreFactory";
import type { Deps } from "../../src/lib/meta/service";

let client: PrismaClient | undefined;
export const db = () =>
  (client ??= new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL,
  }));

export function makeDeps(env: Record<string, string | undefined> = process.env): Deps {
  const cfg = loadMetaConfig(env);
  return {
    cfg: { ...cfg, localIngest: false }, // il gateway non crea mai lead: li distribuisce ai CRM
    store: makePrismaMetaStore(db() as unknown as MetaPrisma),
    fetchImpl: fetch,
    now: () => new Date(),
    log: consoleLogger,
  };
}
