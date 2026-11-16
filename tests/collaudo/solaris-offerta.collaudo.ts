// Collaudo: «← Torna al preventivo» dello Studio porta nell'offerta pannelli (anche di serie, non a catalogo), inverter, batteria,
// installazione e la foto del tetto; rifatto non raddoppia le righe e tiene le spunte delle schede; offerta confermata = rifiutato.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/solaris-offerta.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { portaSolarisInOfferta } from "../../src/lib/solaris/porta-in-offerta";
import { GET as fotoGet } from "../../src/app/api/solaris/foto/[id]/route";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const FOTO = "data:image/jpeg;base64," + Buffer.from("finta-foto").toString("base64");

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "SolarisFoto","SolarisProgetto","SolarisComponente","RigaPreventivo","SezionePreventivo","Preventivo","Cliente","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "Solaris" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "u@x.it", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco Rossi", email: "m@x.it", username: "marco", ruolo: "COMMERCIALE" } });
  const cl = await prisma.cliente.create({ data: { nome: "Bianchi Luca", brandId: b.id } });
  const p = await prisma.preventivo.create({ data: { clienteId: cl.id, brandId: b.id, commercialeId: ugo.id } });
  await prisma.rigaPreventivo.create({ data: { preventivoId: p.id, testoLibero: "Nota del commerciale", quantita: 1, prezzoUnitario: 0 } });
  const batt = await prisma.solarisComponente.create({ data: { brandId: b.id, categoria: "BATTERIA", nome: "Stealth SP-HEV50 5 kWh", potenzaW: 5000, prezzoVendita: 1800, costoAcquisto: 0 } });
  const sp = await prisma.solarisProgetto.create({ data: {
    preventivoId: p.id, clienteId: cl.id, commercialeId: ugo.id, kwp: 7.04, numeroPannelli: 16, batteria: 10, panelId: "jinko440", inverterId: "hw6",
    costoKwp: 900, costoBatteria: 500, statoJson: { battId: batt.id, schedeOfferta: [{ titolo: "Modulo fotovoltaico Jinko", voci: [["Efficienza", "22,8%"]] }] },
  } });
  const opz = { pannello: { nome: "Jinko Tiger Neo 440 W", potenzaW: 440, prezzo: 125 }, inverter: { nome: "Huawei SUN2000-6KTL-L1", prezzo: 1400 }, fotoDataUri: FOTO };

  console.log("1. Primo ritorno all'offerta");
  const e1 = await portaSolarisInOfferta(sp.id, ugo, opz);
  let righe = await prisma.rigaPreventivo.findMany({ where: { preventivoId: p.id }, orderBy: { ordine: "asc" } });
  const pan = righe.find((r) => r.testoLibero?.startsWith("☀️ Pannello"));
  verifica(e1.ok && e1.righe === 4 && e1.foto, "4 righe e la foto", e1);
  verifica(pan?.quantita === 16 && pan.prezzoUnitario === 125, "16 pannelli di serie (non a catalogo) a 125 €", pan);
  verifica(righe.some((r) => r.testoLibero?.startsWith("☀️ Batteria Stealth SP-HEV50") && r.quantita === 2), "batteria: 2 moduli per 10 kWh");
  verifica(righe.some((r) => r.testoLibero === "Nota del commerciale"), "le righe scritte a mano restano");
  verifica(righe.every((r) => !r.allegaScheda), "schede non spuntate (si spuntano a mano)");
  let off = await prisma.preventivo.findUniqueOrThrow({ where: { id: p.id } });
  verifica(off.immagineCopertinaUrl?.startsWith("/api/solaris/foto/"), "foto in copertina", off.immagineCopertinaUrl);
  verifica(Math.round(off.totaleNetto) === 16 * 125 + 1400 + 2 * 1800 + Math.round(7.04 * 900), "totale ricalcolato", off.totaleNetto);
  const fid = off.immagineCopertinaUrl!.split("/").pop()!;
  const res = await fotoGet(new Request("http://x") as never, { params: Promise.resolve({ id: fid }) });
  verifica(res.status === 200 && res.headers.get("content-type") === "image/jpeg" && Buffer.from(await res.arrayBuffer()).toString() === "finta-foto", "la foto si apre dall'indirizzo");

  console.log("2. Spunta la scheda del pannello e torna di nuovo dallo Studio (20 pannelli)");
  await prisma.rigaPreventivo.update({ where: { id: pan!.id }, data: { allegaScheda: true } });
  await prisma.solarisProgetto.update({ where: { id: sp.id }, data: { numeroPannelli: 20, kwp: 8.8 } });
  const e2 = await portaSolarisInOfferta(sp.id, ugo, opz);
  righe = await prisma.rigaPreventivo.findMany({ where: { preventivoId: p.id } });
  const pannelli = righe.filter((r) => r.testoLibero?.startsWith("☀️ Pannello"));
  verifica(e2.ok && righe.length === 5 && pannelli.length === 1 && pannelli[0].quantita === 20, "righe aggiornate, non raddoppiate", righe.length);
  verifica(pannelli[0].allegaScheda && !righe.find((r) => r.testoLibero?.startsWith("☀️ Inverter"))!.allegaScheda, "la spunta del pannello resta, l'inverter resta senza");
  verifica(await prisma.solarisFoto.count({ where: { tipo: "OFFERTA" } }) === 1, "una sola foto per l'offerta");

  console.log("3. Render scelto a mano: la foto non lo sostituisce");
  await prisma.preventivo.update({ where: { id: p.id }, data: { immagineCopertinaUrl: "https://esempio.it/render.jpg" } });
  const e3 = await portaSolarisInOfferta(sp.id, ugo, opz);
  off = await prisma.preventivo.findUniqueOrThrow({ where: { id: p.id } });
  verifica(e3.ok && !e3.foto && off.immagineCopertinaUrl === "https://esempio.it/render.jpg", "render tenuto");

  console.log("4. Permessi e offerta confermata");
  const e4 = await portaSolarisInOfferta(sp.id, marco, opz);
  verifica(!e4.ok && e4.errore === "Non autorizzato", "un altro commerciale non può");
  await prisma.preventivo.update({ where: { id: p.id }, data: { confermatoIl: new Date() } });
  const e5 = await portaSolarisInOfferta(sp.id, ugo, opz);
  verifica(!e5.ok && /confermata/.test(e5.errore), "offerta confermata: rifiutato");

  console.log(`\n${ok} ok, ${ko} ko`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main();
