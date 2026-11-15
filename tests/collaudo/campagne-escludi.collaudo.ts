// Collaudo: «escludi chi ha già ricevuto un'altra campagna» (richiesta di Ugo, nov 2026) con un server SMTP finto.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/campagne-escludi.collaudo.ts
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
import { creaCampagna, salvaCampagna, inviaCampagna, duplicaCampagna } from "../../src/app/campagne-actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const x = (e as { digest?: string }).digest ?? ""; if (!x.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(x.split(";")[2] ?? ""); } };
const idDa = (url: string | null) => url?.match(/\/campagne\/([a-z0-9]+)/)?.[1] ?? "";

async function main() {
  await new Promise<void>((r) => smtp.listen(2536, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2536", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "CampagnaInvio","CampagnaVariante","Campagna","Lead","Cliente","Configurazione","Utente","Brand" CASCADE');
  const pc = await prisma.brand.create({ data: { nome: "P&C" } });
  const rocco = await prisma.utente.create({ data: { nome: "Rocco Zaccaro", email: "rocco@x.it", username: "rocco", ruolo: "MARKETING" } });
  for (let i = 0; i < 10; i++) await prisma.cliente.create({ data: { nome: `Cliente ${i}`, brandId: pc.id, email: `c${i}@x.it`, statoLead: i < 6 ? "Caldo" : "Freddo" } });
  g.__utente = rocco;

  console.log("1. Prima campagna ai 6 contatti «Caldo»");
  const a = idDa(await dove(creaCampagna(fd({ nome: "Pergole messaggio semplice" }))));
  await dove(salvaCampagna(fd({ id: a, stati: "Caldo", oggetto: "Pergole {nome}", testo: "Ciao {nome}" })));
  await dove(inviaCampagna(fd({ id: a })));
  await eseguiCampagne({ max: 50 });
  verifica(posta.length === 6, "6 email inviate", posta.length);

  console.log("2. Seconda campagna a tutti, escludendo chi ha ricevuto la prima");
  posta.length = 0;
  const b = idDa(await dove(creaCampagna(fd({ nome: "Pergole DEM" }))));
  const f = fd({ id: b, oggetto: "DEM {nome}", testo: "Ciao {nome}" });
  f.append("escludiCampagne", a); f.append("escludiCampagne", b);
  await dove(salvaCampagna(f));
  const cb = await prisma.campagna.findUniqueOrThrow({ where: { id: b } });
  verifica(cb.escludiCampagne.join() === a, "salvata l'esclusione (non sé stessa)", cb.escludiCampagne);
  await dove(inviaCampagna(fd({ id: b })));
  await eseguiCampagne({ max: 50 });
  const destinatari = posta.map((m) => m.a[0]).sort();
  verifica(destinatari.join() === "c6@x.it,c7@x.it,c8@x.it,c9@x.it", "solo i 4 contatti nuovi", destinatari);

  console.log("3. Duplica: l'esclusione resta; senza spunta arrivano tutti");
  await dove(duplicaCampagna(fd({ id: b, resta: "1" })));
  const copia = await prisma.campagna.findFirstOrThrow({ where: { nome: "Pergole DEM (copia)" } });
  verifica(copia.escludiCampagne.join() === a, "la copia esclude ancora la prima campagna", copia.escludiCampagne);
  posta.length = 0;
  const c = idDa(await dove(creaCampagna(fd({ nome: "Senza esclusioni" }))));
  await dove(salvaCampagna(fd({ id: c, oggetto: "Tutti {nome}", testo: "Ciao" })));
  await dove(inviaCampagna(fd({ id: c })));
  await eseguiCampagne({ max: 50 });
  verifica(posta.length === 10, "senza spunta: tutti e 10", posta.length);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  smtp.close();
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
