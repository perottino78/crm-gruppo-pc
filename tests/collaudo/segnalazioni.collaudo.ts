// Collaudo: assistenza interna «🆘 Segnala un problema» → Rocco con l'amministratore in copia, risposta a chi ha scritto (server SMTP finto).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/segnalazioni.collaudo.ts
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
import { inviaSegnalazione, risolviSegnalazione, riapriSegnalazione, salvaDestinatarioAssistenza } from "../../src/app/segnalazioni-actions";
import { destinatarioAssistenza, gestisceSegnalazioni } from "../../src/lib/segnalazioni/server";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent(d).replace(/\+/g, " "); } };
const modulo = (o: Record<string, string>, file?: File[]) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); for (const x of file ?? []) f.append("file", x); return f; };
const leggibile = (s: string) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_t, h) => String.fromCharCode(parseInt(h, 16)));

async function main() {
  await new Promise<void>((r) => smtp.listen(2533, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2533", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "SegnalazioneAllegato","Segnalazione","Configurazione","Utente" CASCADE');
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@gruppopec.com", username: "ugo", ruolo: "AMMINISTRATORE" } });
  const rocco = await prisma.utente.create({ data: { nome: "Rocco Zaccaro", email: "marketing@gruppopec.com", username: "rocco", ruolo: "MARKETING", ufficio: "MARKETING", responsabileUfficio: true } });
  const laura = await prisma.utente.create({ data: { nome: "Laura Pinto", email: "laura@gruppopec.com", username: "laura", ruolo: "COMMERCIALE" } });

  console.log("1. Chi riceve");
  verifica((await destinatarioAssistenza())?.id === rocco.id, "di partenza il responsabile del Marketing (Rocco)");
  verifica(gestisceSegnalazioni(rocco, rocco.id) && gestisceSegnalazioni(ugo, rocco.id) && !gestisceSegnalazioni(laura, rocco.id), "le gestiscono Rocco e l'amministratore, non gli altri");

  console.log("2. Laura segnala un problema");
  g.__utente = laura;
  let e = await inviaSegnalazione(modulo({ testo: "", pagina: "http://x/preventivi/1" }));
  verifica(!e.ok && e.messaggio.includes("Scrivi cosa non va"), "senza testo non parte", e);
  e = await inviaSegnalazione(modulo({ testo: "x", pagina: "" }, [new File(["MZ"], "virus.exe", { type: "application/x-msdownload" })]));
  verifica(!e.ok, "solo immagini o PDF", e);
  const png = new File([Buffer.from("89504e470d0a1a0a", "hex")], "schermata.png", { type: "image/png" });
  e = await inviaSegnalazione(modulo({ testo: "Premo «Salva» nell'offerta e non succede nulla", pagina: "https://crm-gruppo-pc.vercel.app/preventivi/abc" }, [png]));
  const s = await prisma.segnalazione.findFirst({ include: { allegati: true } });
  verifica(e.ok && e.messaggio.includes("Rocco Zaccaro") && e.messaggio.includes("in copia") && s?.autoreNome === "Laura Pinto" && s.pagina?.endsWith("/preventivi/abc") && s.allegati.length === 1 && s.destinatarioId === rocco.id, "salvata con pagina, schermata e destinatario", { e, s });
  const m = posta.at(-1)!;
  const txt = leggibile(m.dati);
  verifica(m.a.includes("marketing@gruppopec.com") && m.a.includes("ugo@gruppopec.com") && /^Cc: ugo@gruppopec.com/m.test(m.dati), "email a Rocco con Ugo in copia", m.a);
  verifica(txt.includes("Premo") && txt.includes("/preventivi/abc") && /schermata\.png/.test(m.dati) && /^Reply-To: laura@gruppopec.com/im.test(m.dati), "con testo, pagina, schermata allegata e «rispondi a» Laura");

  console.log("3. Rocco risolve");
  let r = await redirectA(risolviSegnalazione(modulo({ id: s!.id, risposta: "Sistemato" })));
  verifica(r?.includes("Le segnalazioni le chiude") && (await prisma.segnalazione.findUnique({ where: { id: s!.id } }))?.stato === "APERTA", "Laura non può chiuderla", r);
  g.__utente = rocco;
  const n = posta.length;
  r = await redirectA(risolviSegnalazione(modulo({ id: s!.id, risposta: "Sistemato: ricarica la pagina e riprova" })));
  const chiusa = await prisma.segnalazione.findUnique({ where: { id: s!.id } });
  verifica(r?.includes("risolta") && chiusa?.stato === "RISOLTA" && chiusa.risoltaDaNome === "Rocco Zaccaro" && chiusa.risposta?.startsWith("Sistemato"), "chiusa con la risposta", chiusa);
  verifica(posta.length === n + 1 && posta.at(-1)!.a.includes("laura@gruppopec.com") && leggibile(posta.at(-1)!.dati).includes("ricarica la pagina"), "a Laura arriva la risposta");
  await redirectA(riapriSegnalazione(modulo({ id: s!.id })));
  verifica((await prisma.segnalazione.findUnique({ where: { id: s!.id } }))?.stato === "APERTA", "si può riaprire");

  console.log("4. Impostazioni: cambia chi riceve");
  r = await redirectA(salvaDestinatarioAssistenza(modulo({ utenteId: ugo.id })));
  verifica((await destinatarioAssistenza())?.id === rocco.id, "solo l'amministratore lo cambia", r);
  g.__utente = ugo;
  await redirectA(salvaDestinatarioAssistenza(modulo({ utenteId: laura.id })));
  verifica((await destinatarioAssistenza())?.id === laura.id, "scelto un altro destinatario");
  await prisma.utente.update({ where: { id: laura.id }, data: { stato: "DISATTIVATO" } });
  verifica((await destinatarioAssistenza())?.id === rocco.id, "se chi riceve non è più attivo, torna a Rocco");
  g.__utente = rocco;
  const n2 = posta.length;
  e = await inviaSegnalazione(modulo({ testo: "Problema di Rocco stesso", pagina: "" }));
  verifica(e.ok && posta.length === n2 + 1 && posta.at(-1)!.a.includes("ugo@gruppopec.com") && !posta.at(-1)!.a.includes("marketing@gruppopec.com"), "se scrive Rocco, va all'amministratore", posta.at(-1)?.a);

  console.log(`\n${ok} verifiche riuscite, ${ko} fallite`);
}
main().catch((e) => { console.error(e); ko++; }).finally(async () => { smtp.close(); await prisma.$disconnect(); process.exit(ko ? 1 : 0); });
