// Collaudo: percorsi automatici dei lead (ex Keap) con server SMTP finto e orologio simulato.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/automazioni.collaudo.ts
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
import { registraLead } from "../../src/lib/leadIngest";
import { registraEsito, eseguiInviiScaduti, CHIAVE_ATTIVE } from "../../src/lib/automazioni/motore";
import { salvaTestoEmail, ripristinaTestoEmail } from "../../src/app/marketing-actions";
import { creaUtente } from "../../src/app/actions";
import { salvaRecupero } from "../../src/app/lead-percorso-actions";
import { scopeClienteWhere, scopeLeadWhere } from "../../src/lib/scope";
import { puoModificareArticoli } from "../../src/lib/articoli/server";
import { testoStandard } from "../../src/lib/automazioni/personalizza";
import { daOraRoma } from "../../src/lib/calendario/tempo";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };
const ora = () => daOraRoma("2026-11-03T10:00")!;

async function main() {
  await new Promise<void>((r) => smtp.listen(2529, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2529", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "LeadEvento","InvioProgrammato","EmailLead","Lead","Configurazione","Utente","Brand","Cliente" CASCADE');
  await prisma.brand.create({ data: { nome: "P&C" } });
  await prisma.configurazione.create({ data: { chiave: CHIAVE_ATTIVE, valore: "1" } });
  await prisma.utente.create({ data: { nome: "Alessia", email: "a@x.it", username: "alessiav", ruolo: "TELEFONISTA" } });
  const rocco = await prisma.utente.create({ data: { nome: "Rocco Zaccaro", email: "marketing@gruppopec.com", username: "mpec", ruolo: "MARKETING", ufficio: "MARKETING" } });
  const marco = await prisma.utente.create({ data: { nome: "Marco", email: "m@x.it", username: "m", ruolo: "COMMERCIALE" } });

  console.log("1. Permessi del marketing");
  verifica(JSON.stringify(scopeClienteWhere(rocco)) === "{}" && JSON.stringify(scopeLeadWhere(rocco)) === "{}", "vede tutti i clienti e tutti i lead");
  verifica(puoModificareArticoli(rocco) && !puoModificareArticoli(marco), "carica listini e articoli (il commerciale no)");
  g.__utente = marco;
  verifica((await redirectA(salvaTestoEmail(fd({ modello: "request-received", oggetto: "x", testo: "y" }))))?.includes("Solo amministrazione e marketing"), "un commerciale non può cambiare i testi");
  verifica((await prisma.configurazione.count({ where: { chiave: { startsWith: "email_testo:" } } })) === 0, "nessun testo salvato");

  console.log("2. Il marketing cambia il testo del grazie al cliente");
  g.__utente = rocco;
  const r = await redirectA(salvaTestoEmail(fd({ modello: "request-received", oggetto: "Grazie {nome}, ci sentiamo presto!", testo: "Ciao {nome},\n\nabbiamo ricevuto la tua richiesta per {prodotto}.\n\n{note}\n\nChiamaci al {telefono_ufficio}.\n\nRocco e il Gruppo P&C" })));
  verifica(r?.includes("Testo salvato"), "salvato", r);
  verifica((await redirectA(salvaTestoEmail(fd({ modello: "inventata", oggetto: "x", testo: "y" }))))?.includes("Email sconosciuta"), "email inesistente rifiutata");
  verifica((await redirectA(salvaTestoEmail(fd({ modello: "call-requested", variante: "INVENTATA", oggetto: "x", testo: "y" }))))?.includes("Email sconosciuta"), "variante inesistente rifiutata");

  console.log("3. Il lead riceve l'email con il nuovo testo");
  const l = await registraLead({ nome: "Mario Rossi", telefono: "333 1234567", email: "mario@rossi.it", fonte: "facebook", prodotto: "Pergola" });
  await prisma.invioProgrammato.updateMany({ where: { leadId: l!.id }, data: { eseguiDopo: ora() } });
  await registraEsito({ leadId: l!.id, esito: "IN_TARGET", utenteNome: "Alessia" }, ora());
  await eseguiInviiScaduti({ adesso: ora });
  const e = await prisma.emailLead.findFirstOrThrow({ where: { leadId: l!.id, chiave: "request-received" } });
  verifica(e.stato === "INVIATA" && e.oggetto === "Grazie Mario, ci sentiamo presto!", "oggetto personalizzato col nome", e.oggetto);
  verifica(e.testo.startsWith("Ciao Mario,\n\nabbiamo ricevuto la tua richiesta per Pergola.\n\nChiamaci al 011") && e.testo.includes("Non vuoi più ricevere email promozionali?"), "testo personalizzato, nota vuota tolta, disiscrizione presente", e.testo);
  const altra = await prisma.emailLead.findFirstOrThrow({ where: { leadId: l!.id, chiave: "call-requested" } });
  verifica(altra.oggetto.includes("Contatto in target da chiamare"), "le altre email restano con il testo standard");
  verifica(posta.some((p) => p.a[0] === "mario@rossi.it" && p.dati.includes("Grazie Mario")), "partita davvero dal server di posta");

  console.log("4. Torna al testo standard");
  verifica((await redirectA(ripristinaTestoEmail(fd({ modello: "request-received" }))))?.includes("Ripristinato"), "ripristinato");
  verifica((await prisma.configurazione.count({ where: { chiave: "email_testo:request-received" } })) === 0, "testo personalizzato cancellato");
  verifica(testoStandard("request-received").testo.startsWith("Ciao {nome},"), "il punto di partenza è il testo standard con i segnaposto");

  console.log("5. Promozione del recupero e nuovi colleghi");
  verifica((await redirectA(salvaRecupero(fd({ mesi: "3", testo: "• Sconto pergole", fino: "2026-12-31" }))))?.includes("recupero=1"), "il marketing salva la promozione del recupero");
  verifica((await redirectA(creaUtente(fd({ nome: "Nuova Telefonista", email: "nt@gruppopec.com", ruolo: "TELEFONISTA" }))))?.includes("aggiunto al team"), "il marketing aggiunge una telefonista");
  verifica((await redirectA(creaUtente(fd({ nome: "Furbo", email: "f@gruppopec.com", ruolo: "AMMINISTRATORE" }))))?.includes("solo l'amministratore"), "ma non un amministratore");
  verifica((await redirectA(creaUtente(fd({ nome: "Doppio", email: "NT@gruppopec.com", ruolo: "TELEFONISTA" }))))?.includes("già usato"), "email già usata rifiutata");
  verifica((await prisma.utente.count({ where: { ruolo: "AMMINISTRATORE" } })) === 0 && (await prisma.utente.count({ where: { email: "nt@gruppopec.com" } })) === 1, "nel database: nessun amministratore creato, una sola telefonista");
  g.__utente = marco;
  verifica((await redirectA(creaUtente(fd({ nome: "X", email: "x@gruppopec.com", ruolo: "TELEFONISTA" }))))?.includes("/impostazioni") && (await prisma.utente.count({ where: { email: "x@gruppopec.com" } })) === 0, "un commerciale non crea utenti");

  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
  smtp.close();
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
