// Collaudo: invii di campagna rimasti «in corso» per un controllo interrotto ripartono da soli (server SMTP finto).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/campagne-ripresa.collaudo.ts
import net from "node:net";

// ── server SMTP finto: raccoglie le email inviate ─────────────────────────
const posta: { a: string[]; dati: string }[] = [];
const smtp = net.createServer((s) => {
  let inData = false, buf = "", rcpt: string[] = [];
  s.write("220 finto\r\n");
  s.on("data", (d) => {
    buf += d.toString();
    if (inData) {
      const i = buf.indexOf("\r\n.\r\n");
      if (i < 0) return;
      posta.push({ a: rcpt, dati: buf.slice(0, i) });
      buf = buf.slice(i + 5); inData = false; rcpt = [];
      s.write("250 ok\r\n");
    }
    let j;
    while (!inData && (j = buf.indexOf("\r\n")) >= 0) {
      const riga = buf.slice(0, j); buf = buf.slice(j + 2);
      const c = riga.slice(0, 4).toUpperCase();
      if (c === "EHLO") s.write("250-finto\r\n250 AUTH PLAIN LOGIN\r\n");
      else if (c === "AUTH") s.write("235 ok\r\n");
      else if (c === "RCPT") { rcpt.push(riga.match(/<(.+)>/)?.[1] ?? ""); s.write("250 ok\r\n"); }
      else if (c === "DATA") { inData = true; s.write("354 vai\r\n"); }
      else if (c === "QUIT") { s.write("221 ciao\r\n"); s.end(); }
      else s.write("250 ok\r\n");
    }
  });
});

import { prisma } from "../../src/lib/prisma";
import { eseguiCampagne } from "../../src/lib/campagne/motore";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };

async function main() {
  await new Promise<void>((r) => smtp.listen(2534, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2534", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "CampagnaInvio","Campagna","Lead","Cliente","Configurazione","Utente","Brand" CASCADE');
  const b = await prisma.brand.create({ data: { nome: "P&C" } });
  const cl = await Promise.all([1, 2, 3, 4].map((i) => prisma.cliente.create({ data: { nome: `Cliente ${i}`, email: `c${i}@esempio.it`, brandId: b.id } })));
  const c = await prisma.campagna.create({ data: { nome: "Pergole", oggetto: "Ciao {nome}", testo: "Ciao {nome},\n\nproposta.\n\nGruppo P&C", marchi: ["P&C"], stato: "IN_INVIO" } });
  const adesso = new Date();
  const fa = (min: number) => new Date(adesso.getTime() - min * 60_000);
  // 1: preso 30 minuti fa da un controllo interrotto (e prima dello schema nuovo, senza presoIl); 2: preso 20 minuti fa;
  // 3: preso ora da un controllo ancora in corso (non va toccato); 4: interrotto per la terza volta
  await prisma.campagnaInvio.create({ data: { campagnaId: c.id, clienteId: cl[0].id, email: cl[0].email!, stato: "IN_CORSO", tentativi: 1 } });
  await prisma.campagnaInvio.create({ data: { campagnaId: c.id, clienteId: cl[1].id, email: cl[1].email!, stato: "IN_CORSO", tentativi: 1, presoIl: fa(20) } });
  await prisma.campagnaInvio.create({ data: { campagnaId: c.id, clienteId: cl[2].id, email: cl[2].email!, stato: "IN_CORSO", tentativi: 1, presoIl: fa(2) } });
  await prisma.campagnaInvio.create({ data: { campagnaId: c.id, clienteId: cl[3].id, email: cl[3].email!, stato: "IN_CORSO", tentativi: 3, presoIl: fa(30) } });

  const r = await eseguiCampagne();
  const stati = Object.fromEntries((await prisma.campagnaInvio.findMany({ where: { campagnaId: c.id } })).map((x) => [x.email, x]));
  verifica(r.ripresi === 2 && r.inviate === 2, "i due bloccati da più di 10 minuti tornano in coda e partono", r);
  verifica(stati["c1@esempio.it"].stato === "INVIATA" && stati["c2@esempio.it"].stato === "INVIATA" && posta.length === 2, "arrivano le email", posta.map((p) => p.a));
  verifica(stati["c3@esempio.it"].stato === "IN_CORSO", "quello preso da un controllo ancora in corso non si tocca (niente doppioni)");
  verifica(stati["c4@esempio.it"].stato === "FALLITA" && stati["c4@esempio.it"].motivo === "invio interrotto più volte", "dopo 3 interruzioni resta «non inviato»");
  verifica(stati["c1@esempio.it"].presoIl, "quando un invio viene preso si segna l'ora");
  verifica((await prisma.campagna.findUnique({ where: { id: c.id } }))?.stato === "IN_INVIO", "la campagna resta in invio finché c'è qualcosa in corso");
  await prisma.campagnaInvio.update({ where: { id: stati["c3@esempio.it"].id }, data: { presoIl: fa(15) } });
  const r2 = await eseguiCampagne();
  verifica(r2.inviate === 1 && (await prisma.campagna.findUnique({ where: { id: c.id } }))?.stato === "INVIATA", "al controllo dopo parte anche l'ultimo e la campagna risulta inviata", r2);

  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
}
main().catch((e) => { console.error(e); ko++; }).finally(async () => { smtp.close(); await prisma.$disconnect(); process.exit(ko ? 1 : 0); });
