import { PrismaClient } from "@prisma/client";
import illumia from "./seed-data/illumia.json";

const prisma = new PrismaClient();

async function main() {
  const brandNames = ["P&C", "Solaris", "Purafonte", "Work & Services"];
  const brands: Record<string, string> = {};
  for (const nome of brandNames) {
    const b = await prisma.brand.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
    brands[nome] = b.id;
  }

  await prisma.configurazione.upsert({
    where: { chiave: "coefficiente_ricarico_default" },
    update: { valore: "2.1" },
    create: { chiave: "coefficiente_ricarico_default", valore: "2.1" },
  });
  await prisma.configurazione.upsert({
    where: { chiave: "sovrapprezzo_colore_speciale" },
    update: { valore: "35" },
    create: { chiave: "sovrapprezzo_colore_speciale", valore: "35" },
  });
  await prisma.configurazione.upsert({
    where: { chiave: "aliquota_iva_italia" },
    update: { valore: "22" },
    create: { chiave: "aliquota_iva_italia", valore: "22" },
  });
  await prisma.configurazione.upsert({
    where: { chiave: "aliquota_iva_intra_ue" },
    update: { valore: "0" },
    create: { chiave: "aliquota_iva_intra_ue", valore: "0" },
  });
  await prisma.configurazione.upsert({
    where: { chiave: "aliquota_iva_extra_ue" },
    update: { valore: "0" },
    create: { chiave: "aliquota_iva_extra_ue", valore: "0" },
  });

  // Import listino Illumia (brand P&C) - dedupe per unique constraint
  const seen = new Set<string>();
  const data = (illumia as any[])
    .filter((r) => {
      const key = `${r.tipologia}|${r.colore}|${r.altezzaMm}|${r.larghezzaMm}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      brandId: brands["P&C"],
      tipologia: r.tipologia,
      colore: r.colore,
      altezzaMm: r.altezzaMm,
      larghezzaMm: r.larghezzaMm,
      prezzoBase: r.prezzoBase,
    }));

  const CHUNK = 500;
  for (let i = 0; i < data.length; i += CHUNK) {
    await prisma.prodotto.createMany({ data: data.slice(i, i + CHUNK) });
  }
  console.log(`Prodotti importati: ${data.length}`);

  const utenti = [
    { nome: "Ugo Perottino", email: "ugo@gruppopc.it", ruolo: "AMMINISTRATORE" },
    { nome: "Mario Rossi", email: "mario@gruppopc.it", ruolo: "COMMERCIALE" },
    { nome: "Giulia Bianchi", email: "giulia@gruppopc.it", ruolo: "TELEFONISTA" },
    { nome: "Luca Verdi", email: "luca@gruppopc.it", ruolo: "POSATORE" },
    { nome: "Anna Neri", email: "anna@gruppopc.it", ruolo: "AMMINISTRATIVO" },
  ];
  const createdUsers: Record<string, string> = {};
  for (const u of utenti) {
    const created = await prisma.utente.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
    createdUsers[u.ruolo] = created.id;
  }

  const cliente = await prisma.cliente.upsert({
    where: { id: "demo-cliente-1" },
    update: {},
    create: {
      id: "demo-cliente-1",
      nome: "Rossi Costruzioni Srl",
      telefono: "+39 333 1234567",
      email: "info@rossicostruzioni.it",
      paese: "IT",
      brandId: brands["P&C"],
    },
  });

  const prodottoDemo = await prisma.prodotto.findFirst({
    where: { brandId: brands["P&C"], tipologia: "FF1" },
  });

  if (prodottoDemo) {
    const preventivo = await prisma.preventivo.upsert({
      where: { id: "demo-preventivo-1" },
      update: {},
      create: {
        id: "demo-preventivo-1",
        clienteId: cliente.id,
        brandId: brands["P&C"],
        commercialeId: createdUsers["COMMERCIALE"],
        stato: "APERTO",
        totaleNetto: prodottoDemo.prezzoBase * 2.1,
        aliquotaIva: 22,
        totaleIva: prodottoDemo.prezzoBase * 2.1 * 0.22,
      },
    });
    await prisma.rigaPreventivo.upsert({
      where: { id: "demo-riga-1" },
      update: {},
      create: {
        id: "demo-riga-1",
        preventivoId: preventivo.id,
        prodottoId: prodottoDemo.id,
        quantita: 1,
        prezzoUnitario: prodottoDemo.prezzoBase * 2.1,
      },
    });
  }

  await prisma.lead.upsert({
    where: { id: "demo-lead-1" },
    update: {},
    create: {
      id: "demo-lead-1",
      nome: "Verdi Paola",
      telefono: "+39 347 9876543",
      fonte: "instagram",
      fase: "NUOVO",
      brandId: brands["Solaris"],
      telefonistaId: createdUsers["TELEFONISTA"],
    },
  });

  console.log("Seed completato.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
