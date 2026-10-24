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

  // ── Catalogo Solaris: inverter e batterie ──────────────────────────────
  const solarisId = brands["Solaris"];

  const inverterItems = [
    // Monofase ibrido
    { nome: "Inverter Ibrido Monofase 3kW", potenzaW: 3000, faseTipo: "MONOFASE", ibrido: true, note: "Eff. max 97,6% – Vbatt 85-460V – Imax 25A – IP65 – Garanzia 7-15 anni – 411×505×192 mm" },
    { nome: "Inverter Ibrido Monofase 4kW", potenzaW: 4000, faseTipo: "MONOFASE", ibrido: true, note: "Eff. max 97,6% – Vbatt 85-460V – Imax 25A – IP65 – Garanzia 7-15 anni – 411×505×192 mm" },
    { nome: "Inverter Ibrido Monofase 5kW", potenzaW: 5000, faseTipo: "MONOFASE", ibrido: true, note: "Eff. max 97,6% – Vbatt 85-460V – Imax 25A – IP65 – Garanzia 7-15 anni – 411×505×192 mm" },
    // Trifase ibrido
    { nome: "Inverter Ibrido Trifase 5kW",  potenzaW: 5000,  faseTipo: "TRIFASE", ibrido: true, note: "Eff. max 98,6% – Vbatt 180-600V – Imax 25A – IP65 – Garanzia 7-15 anni – 457×654×228 mm – max 16 in parallelo" },
    { nome: "Inverter Ibrido Trifase 6kW",  potenzaW: 6000,  faseTipo: "TRIFASE", ibrido: true, note: "Eff. max 98,6% – Vbatt 180-600V – Imax 25A – IP65 – Garanzia 7-15 anni – 457×654×228 mm" },
    { nome: "Inverter Ibrido Trifase 8kW",  potenzaW: 8000,  faseTipo: "TRIFASE", ibrido: true, note: "Eff. max 98,6% – Vbatt 180-600V – Imax 25A – IP65 – Garanzia 7-15 anni – 457×654×228 mm" },
    { nome: "Inverter Ibrido Trifase 10kW", potenzaW: 10000, faseTipo: "TRIFASE", ibrido: true, note: "Eff. max 98,6% – Vbatt 180-600V – Imax 25A – IP65 – Garanzia 7-15 anni – 457×654×228 mm" },
  ];

  for (const inv of inverterItems) {
    await prisma.solarisComponente.upsert({
      where: { brandId_categoria_nome: { brandId: solarisId, categoria: "INVERTER", nome: inv.nome } },
      update: { note: inv.note },
      create: { brandId: solarisId, categoria: "INVERTER", prezzoVendita: 0, costoAcquisto: 0, ...inv },
    });
  }
  console.log(`Inverter Solaris: ${inverterItems.length} inseriti/aggiornati`);

  const batteriaItems = [
    // Bassa tensione 48V
    { nome: "Accumulo LFP 48V – 2,4kWh",   potenzaW: 2400,  note: "48V LFP – DoD 90% – Imax 50A – IP20 – Garanzia 10 anni – 650×230×1500 mm – Espandibile 2,4÷14,4kWh" },
    { nome: "Accumulo LFP 48V – 4,8kWh",   potenzaW: 4800,  note: "48V LFP – DoD 90% – Imax 100A – IP20 – Garanzia 10 anni – 650×230×1500 mm" },
    { nome: "Accumulo LFP 48V – 7,2kWh",   potenzaW: 7200,  note: "48V LFP – DoD 90% – Imax 100A – IP20 – Garanzia 10 anni – 650×230×1500 mm" },
    { nome: "Accumulo LFP 48V – 9,6kWh",   potenzaW: 9600,  note: "48V LFP – DoD 90% – Imax 100A – IP20 – Garanzia 10 anni – 650×230×1500 mm" },
    { nome: "Accumulo LFP 48V – 14,4kWh",  potenzaW: 14400, note: "48V LFP – DoD 90% – Imax 100A – IP20 – Garanzia 10 anni – 650×230×1500 mm" },
    // Alta tensione 80-576V
    { nome: "Accumulo LFP HV – 5,52kWh",   potenzaW: 5520,  note: "HV 80-576V LFP – DoD 95% – Imax 25A – IP65 – Garanzia 10 anni – 640×220×1500 mm – Espandibile ÷55kWh" },
    { nome: "Accumulo LFP HV – 11,04kWh",  potenzaW: 11040, note: "HV 80-576V LFP – DoD 95% – Imax 25A – IP65 – Garanzia 10 anni – 640×220×1500 mm" },
    { nome: "Accumulo LFP HV – 13,8kWh",   potenzaW: 13800, note: "HV 80-576V LFP – DoD 95% – Imax 25A – IP65 – Garanzia 10 anni – 640×220×1500 mm" },
    // AIO all-in-one
    { nome: "Sistema AIO 5kW + 5,52kWh",   potenzaW: 5000,  note: "All-in-One – 5kW AC uscita – 5,52-8,29kWh LFP – DoD 95% – IP65 – Garanzia 10 anni – Espandibile ÷33kWh – Installazione 30 min" },
  ];

  for (const bat of batteriaItems) {
    await prisma.solarisComponente.upsert({
      where: { brandId_categoria_nome: { brandId: solarisId, categoria: "BATTERIA", nome: bat.nome } },
      update: { note: bat.note },
      create: { brandId: solarisId, categoria: "BATTERIA", prezzoVendita: 0, costoAcquisto: 0, ibrido: false, faseTipo: "MONOFASE", ...bat },
    });
  }
  console.log(`Batterie Solaris: ${batteriaItems.length} inserite/aggiornate`);

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
