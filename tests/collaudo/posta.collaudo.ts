// Collaudo: posta aziendale (dal CRM o da Vercel) e caselle personali degli utenti, con ripiego sulla casella aziendale.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/posta.collaudo.ts
import net from "node:net";

// ── server SMTP finti: registrano chi si autentica, il mittente e il messaggio; "rifiuta" boccia ogni password ─────
type Mail = { server: string; login: string; from: string; a: string[]; dati: string };
const posta: Mail[] = [];
const serverFinto = (nome: string, rifiuta = false) => net.createServer((s) => {
  let inData = false, buf = "", rcpt: string[] = [], from = "", login = "";
  s.write("220 finto\r\n");
  s.on("data", (d) => {
    buf += d.toString();
    if (inData) {
      const i = buf.indexOf("\r\n.\r\n");
      if (i < 0) return;
      posta.push({ server: nome, login, from, a: rcpt, dati: buf.slice(0, i) });
      buf = buf.slice(i + 5); inData = false; rcpt = [];
      s.write("250 ok\r\n");
    }
    let j;
    while (!inData && (j = buf.indexOf("\r\n")) >= 0) {
      const riga = buf.slice(0, j); buf = buf.slice(j + 2);
      const c = riga.slice(0, 4).toUpperCase();
      if (c === "EHLO") s.write("250-finto\r\n250 AUTH PLAIN\r\n");
      else if (c === "AUTH") {
        login = Buffer.from(riga.split(" ")[2] ?? "", "base64").toString().split("\0")[1] ?? "";
        s.write(rifiuta ? "535 Incorrect authentication data\r\n" : "235 ok\r\n");
      }
      else if (c === "MAIL") { from = riga.match(/<(.*)>/)?.[1] ?? ""; s.write("250 ok\r\n"); }
      else if (c === "RCPT") { rcpt.push(riga.match(/<(.+)>/)?.[1] ?? ""); s.write("250 ok\r\n"); }
      else if (c === "DATA") { inData = true; s.write("354 vai\r\n"); }
      else if (c === "QUIT") { s.write("221 ciao\r\n"); s.end(); }
      else s.write("250 ok\r\n");
    }
  });
});
const vercel = serverFinto("vercel"), aziendale = serverFinto("aziendale"), rifiuta = serverFinto("rifiuta", true);

import { prisma } from "../../src/lib/prisma";
import { inviaMail, mailConfigurata, postaAziendale, provaCasella, indirizzoMittente } from "../../src/lib/mail/invio";
import { cifra, casellaPersonale } from "../../src/lib/mail/caselle";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const imposta = (chiave: string, valore: string) => prisma.configurazione.upsert({ where: { chiave }, update: { valore }, create: { chiave, valore } });
const intestazione = (m: Mail, h: string) => m.dati.match(new RegExp(`^${h}: (.*)$`, "mi"))?.[1]?.trim() ?? "";
const ultima = () => posta[posta.length - 1];

async function main() {
  await Promise.all([[vercel, 2541], [aziendale, 2542], [rifiuta, 2543]].map(([s, p]) => new Promise<void>((r) => (s as net.Server).listen(p as number, r))));
  for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_PORT", "MAIL_FROM"]) delete process.env[k];
  await prisma.$executeRawUnsafe('TRUNCATE "Configurazione","Utente" CASCADE');
  const marco = await prisma.utente.create({ data: { nome: "Marco Piccatti", email: "marco.piccatti@gruppopec.com", username: "marco", ruolo: "COMMERCIALE" } });
  const laura = await prisma.utente.create({ data: { nome: "Laura Bianchi", email: "laura@gruppopec.com", username: "laura", ruolo: "AMMINISTRATIVO" } });

  console.log("1. Nessuna casella: il lavoro va avanti, l'email no");
  verifica(!(await mailConfigurata()), "posta non configurata");
  const e0 = await inviaMail({ a: ["cliente@x.it"], oggetto: "Ciao", testo: "t", daUtenteId: marco.id });
  verifica(!e0.inviata && e0.motivo === "invio automatico non configurato", "nessun errore lanciato, solo il motivo", e0);

  console.log("2. Variabili di Vercel (come prima)");
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2541", SMTP_USER: "vercel@gruppopec.com", SMTP_PASS: "x", MAIL_FROM: "Gruppo P&C <vercel@gruppopec.com>" });
  const e1 = await inviaMail({ a: ["cliente@x.it"], oggetto: "Ciao", testo: "t" });
  verifica(e1.inviata && ultima().server === "vercel" && ultima().from === "vercel@gruppopec.com", "parte da Vercel", { e1, u: ultima() });
  verifica(await indirizzoMittente() === "vercel@gruppopec.com", "mittente per gli inviti di calendario");

  console.log("3. Posta aziendale impostata dal CRM: ha la precedenza");
  await imposta("posta_host", "127.0.0.1"); await imposta("posta_porta", "2542");
  await imposta("posta_utente", "crm@gruppopec.com"); await imposta("posta_password", cifra("pw-aziendale"));
  await imposta("posta_mittente", "Gruppo P&C <crm@gruppopec.com>");
  verifica((await postaAziendale())?.utente === "crm@gruppopec.com", "casella del CRM in uso");
  const e2 = await inviaMail({ a: ["cliente@x.it"], oggetto: "Ciao", testo: "t" });
  verifica(e2.inviata && ultima().server === "aziendale" && ultima().login === "crm@gruppopec.com", "parte dal server aziendale con la casella del CRM", ultima());
  const riga = await prisma.configurazione.findUnique({ where: { chiave: "posta_password" } });
  verifica(!riga!.valore.includes("pw-aziendale"), "password aziendale cifrata nel database");

  console.log("4. Chi non ha collegato la sua casella: parte dall'aziendale, le risposte vanno a lui");
  await inviaMail({ a: ["cliente@x.it"], oggetto: "Offerta", testo: "t", daUtenteId: marco.id });
  verifica(ultima().from === "crm@gruppopec.com" && intestazione(ultima(), "Reply-To") === "marco.piccatti@gruppopec.com", "rispondi a Marco", intestazione(ultima(), "Reply-To"));

  console.log("5. Casella personale collegata: basta la password");
  await prisma.utente.update({ where: { id: marco.id }, data: { smtpPassword: cifra("pw-marco") } });
  const e3 = await inviaMail({ a: ["cliente@x.it"], oggetto: "Offerta", testo: "t", daUtenteId: marco.id });
  verifica(e3.inviata && e3.da === "marco.piccatti@gruppopec.com", "inviata dalla casella di Marco", e3);
  verifica(ultima().login === "marco.piccatti@gruppopec.com" && ultima().from === "marco.piccatti@gruppopec.com" && ultima().server === "aziendale", "si autentica come Marco sul server aziendale", ultima());
  verifica(intestazione(ultima(), "From").includes("Marco Piccatti"), "con il suo nome", intestazione(ultima(), "From"));
  await inviaMail({ a: ["ufficio@x.it"], oggetto: "Avviso", testo: "t" });
  verifica(ultima().login === "crm@gruppopec.com", "gli avvisi interni restano sulla casella aziendale");

  console.log("6. Password sbagliata: non si perde l'email, si avvisa nel profilo");
  await prisma.utente.update({ where: { id: laura.id }, data: { smtpPassword: cifra("sbagliata"), smtpPorta: 2543 } });
  const e4 = await inviaMail({ a: ["cliente@x.it"], oggetto: "Fattura", testo: "t", daUtenteId: laura.id });
  verifica(e4.inviata && ultima().server === "aziendale" && intestazione(ultima(), "Reply-To") === "laura@gruppopec.com", "ripiego sulla casella aziendale, rispondi a Laura", { e4, u: ultima() });
  const l = await prisma.utente.findUniqueOrThrow({ where: { id: laura.id } });
  verifica(l.smtpErrore === "email o password della casella non corrette", "errore spiegato nel profilo", l.smtpErrore);

  console.log("7. Prova della casella");
  const az = await postaAziendale();
  const p1 = await provaCasella(casellaPersonale(await prisma.utente.findUniqueOrThrow({ where: { id: marco.id } }), az)!, marco.email);
  verifica(p1.inviata && ultima().a[0] === marco.email && intestazione(ultima(), "Subject").includes("Prova"), "prova riuscita: email a lui stesso", p1);
  const p2 = await provaCasella(casellaPersonale(l, az)!, l.email);
  verifica(!p2.inviata && p2.motivo === "email o password della casella non corrette", "prova fallita con il motivo in chiaro", p2);

  console.log("8. Senza Vercel basta la casella del CRM");
  for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_PORT", "MAIL_FROM"]) delete process.env[k];
  verifica(await mailConfigurata(), "posta attiva solo con le impostazioni del CRM");

  // le caselle finte non devono restare per gli altri collaudi
  await prisma.configurazione.deleteMany({ where: { chiave: { startsWith: "posta_" } } });
  for (const s of [vercel, aziendale, rifiuta]) s.close();
  await prisma.$disconnect();
  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
