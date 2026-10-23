import { loadMetaConfig } from "./config";
import { consoleLogger } from "./log";
import { prismaInboundStore, prismaMetaStore } from "./prismaStore";
import { prismaLeadSink } from "./prismaSink";
import type { Deps } from "./service";

export function makeDeps(): Deps {
  return { cfg: loadMetaConfig(), store: prismaMetaStore, sink: prismaLeadSink, inbound: prismaInboundStore, fetchImpl: fetch, now: () => new Date(), log: consoleLogger };
}
