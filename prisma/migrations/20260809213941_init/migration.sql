-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Utente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ruolo" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "fonte" TEXT NOT NULL DEFAULT 'facebook',
    "fase" TEXT NOT NULL DEFAULT 'NUOVO',
    "note" TEXT,
    "brandId" TEXT NOT NULL,
    "telefonistaId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lead_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lead_telefonistaId_fkey" FOREIGN KEY ("telefonistaId") REFERENCES "Utente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "indirizzo" TEXT,
    "paese" TEXT NOT NULL DEFAULT 'IT',
    "brandId" TEXT NOT NULL,
    "leadOrigineId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cliente_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Cliente_leadOrigineId_fkey" FOREIGN KEY ("leadOrigineId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Appuntamento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clienteId" TEXT NOT NULL,
    "utenteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'COMMERCIALE',
    "dataOra" DATETIME NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'PROGRAMMATO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Appuntamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appuntamento_utenteId_fkey" FOREIGN KEY ("utenteId") REFERENCES "Utente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prodotto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "tipologia" TEXT NOT NULL,
    "descrizione" TEXT,
    "colore" TEXT NOT NULL,
    "altezzaMm" INTEGER NOT NULL,
    "larghezzaMm" INTEGER NOT NULL,
    "prezzoBase" REAL NOT NULL,
    CONSTRAINT "Prodotto_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Configurazione" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chiave" TEXT NOT NULL,
    "valore" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Preventivo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clienteId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "commercialeId" TEXT NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'APERTO',
    "totaleNetto" REAL NOT NULL DEFAULT 0,
    "aliquotaIva" REAL NOT NULL DEFAULT 22,
    "totaleIva" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scadenza" DATETIME,
    CONSTRAINT "Preventivo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Preventivo_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Preventivo_commercialeId_fkey" FOREIGN KEY ("commercialeId") REFERENCES "Utente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RigaPreventivo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "preventivoId" TEXT NOT NULL,
    "prodottoId" TEXT NOT NULL,
    "quantita" INTEGER NOT NULL DEFAULT 1,
    "prezzoUnitario" REAL NOT NULL,
    "optionalDescrizione" TEXT,
    "optionalPrezzo" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "RigaPreventivo_preventivoId_fkey" FOREIGN KEY ("preventivoId") REFERENCES "Preventivo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RigaPreventivo_prodottoId_fkey" FOREIGN KEY ("prodottoId") REFERENCES "Prodotto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromemoriaInviato" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "preventivoId" TEXT NOT NULL,
    "canale" TEXT NOT NULL,
    "inviatoIl" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromemoriaInviato_preventivoId_fkey" FOREIGN KEY ("preventivoId") REFERENCES "Preventivo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Progetto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "preventivoId" TEXT NOT NULL,
    "misureRilievoConfermate" TEXT,
    "statoOrdineFornitore" TEXT NOT NULL DEFAULT 'da_avviare',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Progetto_preventivoId_fkey" FOREIGN KEY ("preventivoId") REFERENCES "Preventivo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_nome_key" ON "Brand"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Utente_email_key" ON "Utente"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_leadOrigineId_key" ON "Cliente"("leadOrigineId");

-- CreateIndex
CREATE UNIQUE INDEX "Prodotto_brandId_tipologia_colore_altezzaMm_larghezzaMm_key" ON "Prodotto"("brandId", "tipologia", "colore", "altezzaMm", "larghezzaMm");

-- CreateIndex
CREATE UNIQUE INDEX "Configurazione_chiave_key" ON "Configurazione"("chiave");

-- CreateIndex
CREATE UNIQUE INDEX "Progetto_preventivoId_key" ON "Progetto"("preventivoId");
