-- CreateTable
CREATE TABLE "MetaDelivery" (
    "id" TEXT NOT NULL,
    "leadgenId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "adId" TEXT,
    "adgroupId" TEXT,
    "createdTimeMeta" TIMESTAMP(3),
    "origine" TEXT NOT NULL DEFAULT 'META',
    "stato" TEXT NOT NULL DEFAULT 'RECEIVED',
    "tentativi" INTEGER NOT NULL DEFAULT 0,
    "erroreCodice" TEXT,
    "retriabile" BOOLEAN NOT NULL DEFAULT true,
    "nextRetryAt" TIMESTAMP(3),
    "eventJson" TEXT NOT NULL,
    "leadJson" TEXT,
    "leadId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaDownstream" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'PENDING',
    "tentativi" INTEGER NOT NULL DEFAULT 0,
    "erroreCodice" TEXT,
    "retriabile" BOOLEAN NOT NULL DEFAULT true,
    "nextRetryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaDownstream_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaDelivery_leadgenId_key" ON "MetaDelivery"("leadgenId");

-- CreateIndex
CREATE INDEX "MetaDelivery_stato_nextRetryAt_idx" ON "MetaDelivery"("stato", "nextRetryAt");

-- CreateIndex
CREATE INDEX "MetaDownstream_stato_nextRetryAt_idx" ON "MetaDownstream"("stato", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetaDownstream_deliveryId_destinatario_key" ON "MetaDownstream"("deliveryId", "destinatario");

-- AddForeignKey
ALTER TABLE "MetaDownstream" ADD CONSTRAINT "MetaDownstream_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "MetaDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

