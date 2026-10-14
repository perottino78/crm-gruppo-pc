import { loadMetaConfig } from "./config";
import { consoleLogger } from "./log";
import { prismaMetaStore } from "./prismaStore";
import { prismaLeadSink } from "./prismaSink";
import type { Deps } from "./service";

export function makeDeps(): Deps {
  return { cfg: loadMetaConfig(), store: prismaMetaStore, sink: prismaLeadSink, fetchImpl: fetch, now: () => new Date(), log: consoleLogger };
}
