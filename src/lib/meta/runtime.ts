import { loadMetaConfig } from "./config";
import { consoleLogger } from "./log";
import { prismaInboundStore, prismaMetaStore } from "./prismaStore";
import { prismaLeadSink } from "./prismaSink";
import type { Deps } from "./service";

export function makeDeps(): Deps {
  return { cfg: loadMetaConfig(), store: prismaMetaStore, sink: prismaLeadSink, inbound: prismaInboundStore, fetchImpl: fetch, now: () => new Date(), log: consoleLogger };
}

/** Come makeDeps, con i moduli collegati da Impostazioni › Lead e la nota dei moduli scartati. */
export async function makeDepsConModuli(): Promise<Deps> {
  const { cfgConModuli, registraScartato } = await import("./moduli-server");
  const d = makeDeps();
  return { ...d, cfg: await cfgConModuli(d.cfg), onScartato: registraScartato };
}
