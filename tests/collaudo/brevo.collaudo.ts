// Collaudo: servizio di invio Brevo per campagne ed email automatiche, con due server SMTP finti (posta aziendale e Brevo)
// e il webhook degli eventi. DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/brevo.collaudo.ts
import net from "node:net";

type Mail = { da: string; a: string[]; dati: string };
function smtpFinto(porta: number, posta: Mail[], rifiuta = () => false) {
  return net.createServer((s) => {
    let inData = false, buf = "", rcpt: string[] = [], from = "";
    s.write("220 finto\r\n");
    s.on("data", (d) => {
      buf += d.toString();
      if (inData) {
        const i = buf.indexOf("\r\n.\r\n");
        if (i < 0) return;
        posta.push({ da: from, a: rcpt, dati: buf.slice(0, i) });
        buf = buf.slice(i + 5); inData = false; rcpt = [];
        s.write("250 ok\r\n");
      }
      let j;
      while (!inData && (j = buf.indexOf("\r\n")) >= 0) {
        const riga = buf.slice(0, j); buf = buf.slice(j + 2);
        const c = riga.slice(0, 4).toUpperCase();
        if (c === "EHLO") s.write("250-finto\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (c === "AUTH") s.write(rifiuta() ? "535 credenziali errate\r\n" : "235 ok\r\n");
        else if (c === "MAIL") { from = riga.match(/<(.*)>/)?.[1] ?? ""; s.write("250 ok\r\n"); }
        else if (c === "RCPT") { rcpt.push(riga.match(/<(.+)>/)?.[1] ?? ""); s.write("250 ok\r\n"); }
        else if (c === "DATA") { inData = true; s.write("354 vai\r\n"); }
        else if (c === "QUIT") { s.write("221 ciao\r\n"); s.end(); }
        else s.write("250 ok\r\n");
      }
    });
  }).listen(porta);
}
const aziendale: Mail[] = [], brevo: Mail[] = [];
let chiaveSbagliata = false;
smtpFinto(2551, aziendale);
smtpFinto(2552, brevo, () => chiaveSbagliata);
Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2551", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x", MAIL_FROM: "Gruppo P&C <crm@gruppopec.com>" });

import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { eseguiCampagne } from "../../src/lib/campagne/motore";
import { inviaMail } from "../../src/lib/mail/invio";
import { salvaServizioInvio } from "../../src/app/posta-actions";
import { chiaveWebhook, servizioInvio } from "../../src/lib/mail/servizio";
import { POST as webhook } from "../../src/app/api/brevo/eventi/route";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };
const aspetta = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function campagna(nome: string, marchi: string[], n: number) {
  const c = await prisma.campagna.create({ data: { nome, oggetto: `Oggetto ${nome}`, testo: "Ciao {nome}", marchi, stato: "IN_INVIO", tracciamento: false } });
  for (let i = 0; i < n; i++) {
    const cl = await prisma.cliente.create({ data: { nome: `Cliente ${nome} ${i}`, email: `c${i}.${nome}@esempio.it`, brandId: (await prisma.brand.findFirstOrThrow()).id } });
    await prisma.campagnaInvio.create({ data: { campagnaId: c.id, clienteId: cl.id, email: cl.email! } });
  }
  return c;
}

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "CampagnaInvio","Campagna","Lead","Cliente","Configurazione","Utente","Brand" CASCADE');
  await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@gruppopec.com", username: "ugo", ruolo: "AMMINISTRATORE" } });
  g.__utente = ugo;

  console.log("1. Senza Brevo: tutto come prima (posta aziendale, 40 per volta)");
  await campagna("prima", [], 45);
  let r = await eseguiCampagne();
  verifica(r.inviate === 40 && aziendale.length === 40 && brevo.length === 0, "40 email dalla posta aziendale", r);
  await eseguiCampagne();
  aziendale.length = 0;

  console.log("2. Collegare Brevo");
  chiaveSbagliata = true;
  let x = await dove(salvaServizioInvio(fd({ utente: "abc@smtp-brevo.com", chiave: "sbagliata", host: "127.0.0.1", porta: "2552" })));
  verifica(x?.includes("Non collegato") && !(await servizioInvio()), "chiave sbagliata: messaggio chiaro e niente salvato", x);
  chiaveSbagliata = false;
  x = await dove(salvaServizioInvio(fd({ utente: "abc@smtp-brevo.com", chiave: "xsmtpsib-buona", host: "127.0.0.1", porta: "2552" })));
  verifica(x?.includes("Brevo collegato") && brevo.length === 1 && brevo[0].a[0] === "ugo@gruppopec.com", "chiave giusta: prova arrivata da Brevo a chi ha salvato", x);
  const chiave = await prisma.configurazione.findUnique({ where: { chiave: "servizio_chiave" } });
  verifica(chiave && !chiave.valore.includes("buona"), "chiave salvata cifrata");
  brevo.length = 0;

  console.log("3. Campagne da Brevo");
  const c = await campagna("brevo", [], 120);
  const s = await campagna("solaris", ["Solaris"], 3);
  r = await eseguiCampagne();
  await aspetta(300);
  verifica(r.inviate === 123 && brevo.length === 123 && aziendale.length === 0, "tutte le 123 email in un solo giro, tutte da Brevo (non più 40)", { r, brevo: brevo.length, az: aziendale.length });
  const unaPC = brevo.find((m) => m.a[0].includes(".brevo@"))!;
  const unaSol = brevo.find((m) => m.a[0].includes(".solaris@"))!;
  verifica(/^From: .*promozionale@gruppopec\.com/m.test(unaPC.dati) && /^From: .*promozionale@solarisfotovoltaico\.com/m.test(unaSol.dati), "mittente: P&C per le campagne P&C, Solaris per quelle solo Solaris");
  const inv = await prisma.campagnaInvio.findFirstOrThrow({ where: { campagnaId: c.id, email: unaPC.a[0] } });
  verifica(new RegExp(`^X-Mailin-custom: c-${inv.id}`, "mi").test(unaPC.dati), "ogni email porta il codice dell'invio per Brevo (X-Mailin-custom)");
  verifica(unaPC.da === "promozionale@gruppopec.com", "busta lasciata a Brevo (niente rimbalzi nella casella aziendale)", unaPC.da);
  verifica((await prisma.campagna.findUniqueOrThrow({ where: { id: s.id } })).stato === "INVIATA", "campagna finita");

  console.log("4. Le altre email restano sulla posta aziendale");
  await inviaMail({ a: ["ufficio@gruppopec.com"], oggetto: "Avviso interno", testo: "x" });
  verifica(aziendale.length === 1 && brevo.length === 123, "avviso interno dalla posta aziendale");

  console.log("5. Webhook di Brevo");
  const k = await chiaveWebhook();
  const chiama = (corpo: unknown, kk = k) => webhook(new NextRequest(`http://localhost/api/brevo/eventi?k=${kk}`, { method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json" } }));
  verifica((await chiama({ event: "hard_bounce", email: inv.email }, "falsa")).status === 401, "chiave falsa: rifiutato");
  const ris = await (await chiama([{ event: "hard_bounce", email: inv.email, "X-Mailin-custom": `c-${inv.id}`, reason: "user unknown" }, { event: "unsubscribed", email: "c1.brevo@esempio.it" }, { event: "delivered", email: "c2.brevo@esempio.it" }])).json();
  verifica(ris.rimbalzi === 1 && ris.disiscritti === 1 && ris.ignorati === 1, "eventi letti", ris);
  const dopo = await prisma.campagnaInvio.findUniqueOrThrow({ where: { id: inv.id } });
  const cl = await prisma.cliente.findUniqueOrThrow({ where: { id: inv.clienteId } });
  verifica(dopo.stato === "RIMBALZATA" && cl.emailRimbalzata === inv.email, "rimbalzo: invio RIMBALZATA e indirizzo da non usare più", { s: dopo.stato, r: cl.emailRimbalzata });
  verifica((await prisma.cliente.findFirstOrThrow({ where: { email: "c1.brevo@esempio.it" } })).disiscritto, "disiscrizione da Brevo: cliente disiscritto");

  console.log(`\n${ok} ok, ${ko} falliti`);
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
