import { prisma } from "@/lib/prisma";
import { makePrismaInboundStore, makePrismaMetaStore } from "./prismaStoreFactory";

export const prismaMetaStore = makePrismaMetaStore(prisma);
export const prismaInboundStore = makePrismaInboundStore(prisma);
