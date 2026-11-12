// Collaudo: dalla scheda cliente task a un collega ed email scritta in ONE; colore e «calendario attivo» (server SMTP finto).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/scheda-cliente.collaudo.ts
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
import { creaTaskCliente, completaTaskCliente } from "../../src/app/task-clienti-actions";
import { inviaEmailCliente } from "../../src/app/cliente-email-actions";
import { salvaCalendarioUtente } from "../../src/app/team-actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };
const modulo = (o: Record<string, string | string[]>, file?: File[]) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
  for (const x of file ?? []) f.append("file", x);
  return f;
};
const leggibile = (s: string) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_t, h) => String.fromCharCode(parseInt(h, 16)));

async function main() {
  await new Promise<void>((r) => smtp.listen(2532, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2532", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "Attivita","Documento","Preventivo","Configurazione","Utente","Brand","Cliente" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@gruppopec.com", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const cri = await prisma.utente.create({ data: { nome: "Cristina Bianchi", email: "cristina@gruppopec.com", username: "cri", ruolo: "TELEFONISTA" } });
  const ex = await prisma.utente.create({ data: { nome: "Ex Collega", email: "ex@gruppopec.com", username: "ex", ruolo: "COMMERCIALE", stato: "DISATTIVATO" } });
  const cliente = await prisma.cliente.create({ data: { nome: "Rossi Mario", email: "mario@rossi.it", brandId: brand.id, responsabileId: ugo.id } });
  const doc = await prisma.documento.create({ data: { entita: "CLIENTE", entitaId: cliente.id, cartella: "Generale", nome: "planimetria.pdf", mime: "application/pdf", dimensione: 9, contenuto: Buffer.from("%PDF-1.4\n") } });
  g.__utente = ugo;

  console.log("1. Task dalla scheda cliente");
  let r = await redirectA(creaTaskCliente(modulo({ clienteId: cliente.id, oggetto: "", utenteId: cri.id })));
  verifica(r?.includes("Scrivi cosa c'è da fare"), "senza testo non parte", r);
  r = await redirectA(creaTaskCliente(modulo({ clienteId: cliente.id, oggetto: "Chiama", utenteId: ex.id })));
  verifica(r?.includes("Scegli una persona del team"), "non a chi non è più attivo", r);
  r = await redirectA(creaTaskCliente(modulo({ clienteId: cliente.id, oggetto: "Richiamare per i colori", descrizione: "Preferisce il pomeriggio", utenteId: cri.id, scadenza: "2026-11-20" })));
  const t = await prisma.attivita.findFirst({ where: { tipo: "TASK", clienteId: cliente.id } });
  verifica(r?.includes("Task dato a Cristina Bianchi (avvisato via email)") && t?.utenteId === cri.id && t.creatoDaNome === "Ugo Perottino" && t.scadenza?.toISOString().startsWith("2026-11-19T23:00"), "task a Cristina con scadenza (ora di Roma) e chi l'ha dato", { r, t });
  const avviso = posta.at(-1)!;
  verifica(avviso.a.includes("cristina@gruppopec.com") && leggibile(avviso.dati).includes("Richiamare per i colori") && leggibile(avviso.dati).includes(`/clienti/${cliente.id}?sez=task`), "a Cristina arriva l'email con il link al cliente");
  const nPosta = posta.length;
  r = await redirectA(creaTaskCliente(modulo({ clienteId: cliente.id, oggetto: "Promemoria per me" })));
  verifica(r?.includes("Task dato a te") && posta.length === nPosta, "a sé stessi: niente email", r);
  await completaTaskCliente(modulo({ id: t!.id }));
  const fatto = await prisma.attivita.findUnique({ where: { id: t!.id } });
  verifica(fatto?.completata && fatto.completataIl, "«fatto» chiude il task con la data");

  console.log("2. Email al cliente da ONE");
  r = await redirectA(inviaEmailCliente(modulo({ clienteId: cliente.id, a: "non-email", oggetto: "x", testo: "y", firma: "" })));
  verifica(r?.includes("Scrivi l'indirizzo email"), "senza email valida non parte", r);
  const pdf = new File([Buffer.from("%PDF-1.4 preventivo")], "misure.pdf", { type: "application/pdf" });
  r = await redirectA(inviaEmailCliente(modulo({ clienteId: cliente.id, a: "Mario@Rossi.it", cc: "cristina@gruppopec.com", oggetto: "Appuntamento di giovedì", testo: "Gentile Mario,\n\nle confermo giovedì alle 10.\n\nCordiali saluti", firma: "Ugo Perottino\nGruppo P&C", documento: doc.id }, [pdf])));
  const m = posta.at(-1)!;
  verifica(r?.includes(`/clienti/${cliente.id}?sez=attivita&inviata=mario@rossi.it`), "inviata e si torna alle attività del cliente", r);
  verifica(m.a.includes("mario@rossi.it") && m.a.includes("cristina@gruppopec.com") && /planimetria\.pdf/.test(m.dati) && /misure\.pdf/.test(leggibile(m.dati)) && leggibile(m.dati).includes("Gruppo P&C"), "arriva con copia, allegati e firma");
  const att = await prisma.attivita.findFirst({ where: { tipo: "EMAIL", clienteId: cliente.id } });
  verifica(att?.oggetto === "Email: Appuntamento di giovedì" && att.descrizione?.includes("le confermo giovedì") && att.descrizione.includes("misure.pdf"), "resta nelle attività del cliente con il testo", att);
  verifica((await prisma.documento.count({ where: { entita: "CLIENTE", entitaId: cliente.id, cartella: "Corrispondenza", nome: "misure.pdf" } })) === 1, "il file dal computer resta nei documenti del cliente");

  console.log("3. Calendario di ogni persona");
  r = await redirectA(salvaCalendarioUtente(modulo({ utenteId: cri.id, ritorno: "/impostazioni", inCalendario: "1", colore: "#E34948" })));
  verifica((await prisma.utente.findUnique({ where: { id: cri.id } }))?.coloreCalendario === "#e34948", "colore scelto salvato", r);
  r = await redirectA(salvaCalendarioUtente(modulo({ utenteId: cri.id, ritorno: "/impostazioni", colore: "#E34948", automatico: "1" })));
  const c2 = await prisma.utente.findUnique({ where: { id: cri.id } });
  verifica(c2?.coloreCalendario === null && c2.inCalendario === false, "torna automatico e senza spunta non compare nel calendario");
  g.__utente = cri;
  r = await redirectA(salvaCalendarioUtente(modulo({ utenteId: cri.id, ritorno: "/impostazioni", inCalendario: "1" })));
  verifica(r?.includes("Solo l'amministratore") && (await prisma.utente.findUnique({ where: { id: cri.id } }))?.inCalendario === false, "solo l'amministratore lo cambia", r);

  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
}
main().catch((e) => { console.error(e); ko++; }).finally(async () => { smtp.close(); await prisma.$disconnect(); process.exit(ko ? 1 : 0); });
