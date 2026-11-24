// Collaudo: backup sul NAS. Esporta dalle rotte vere (elenco, tabella a parti, fatto), salva i file come lo script del NAS,
// li ripristina in un secondo database vuoto e confronta. Avviso agli amministratori con un server SMTP finto.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest DATABASE_URL_2=postgresql://t:t@localhost:5432/crmtest2 \
//   node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/backup.collaudo.ts
import net from "node:net";
import { mkdtempSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { GET as elenco } from "../../src/app/api/backup/elenco/route";
import { GET as tabella } from "../../src/app/api/backup/tabella/route";
import { POST as fatto } from "../../src/app/api/backup/fatto/route";
import { GET as script } from "../../src/app/api/backup/script/route";
import { generaChiaveBackup } from "../../src/app/backup-actions";
import { controllaBackup, situazioneBackup } from "../../src/lib/backup/server";
import { ripristina } from "../../scripts/backup/ripristina";

const posta: { a: string[]; dati: string }[] = [];
const smtp = net.createServer((s) => {
  let inData = false, buf = "", rcpt: string[] = [];
  s.write("220 finto\r\n");
  s.on("data", (d) => {
    buf += d.toString();
    if (inData) { const i = buf.indexOf("\r\n.\r\n"); if (i < 0) return; posta.push({ a: rcpt, dati: buf.slice(0, i) }); buf = buf.slice(i + 5); inData = false; rcpt = []; s.write("250 ok\r\n"); }
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

if (!process.env.DATABASE_URL?.includes("localhost") || !process.env.DATABASE_URL_2?.includes("localhost")) throw new Error("Solo su database locali di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const req = (url: string, chiave?: string, init?: { method?: string; body?: string }) =>
  new NextRequest(`http://localhost${url}`, { method: init?.method, body: init?.body, headers: chiave ? { "x-backup-key": chiave } : {} });

async function main() {
  await new Promise<void>((r) => smtp.listen(2546, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2546", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  const tutte = (await prisma.$queryRawUnsafe<{ n: string }[]>(`SELECT tablename AS n FROM pg_tables WHERE schemaname='public'`)).map((r) => `"${r.n}"`);
  await prisma.$executeRawUnsafe(`TRUNCATE ${tutte.join(",")} CASCADE`);
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@x.it", username: "ugo", ruolo: "AMMINISTRATORE", visibileProvince: ["TO", "CN"] } });
  const tel = await prisma.utente.create({ data: { nome: "Cristina", email: "cri@x.it", username: "cri", ruolo: "TELEFONISTA" } });
  const brand = await prisma.brand.create({ data: { nome: "P&C", utentiAutorizzati: { connect: [{ id: tel.id }] } } });
  await prisma.cliente.createMany({ data: Array.from({ length: 2300 }, (_, i) => ({ nome: `Cliente ${i} «àè» "virgolette"\n a capo`, brandId: brand.id, tag: `t${i % 7}` })) });
  const file = Array.from({ length: 23 }, (_, i) => Buffer.from(Array.from({ length: 5000 + i * 300 }, (_, k) => (k * 7 + i) % 256)));
  for (const [i, b] of file.entries()) await prisma.documento.create({ data: { entita: "CLIENTE", entitaId: "x", nome: `f${i}.pdf`, mime: "application/pdf", dimensione: b.length, contenuto: b } });
  await prisma.configurazione.create({ data: { chiave: "prova_json", valore: JSON.stringify({ a: [1, 2], b: "€" }) } });

  console.log("1. Chiave: solo l'amministratore, mostrata una volta, salvata come impronta");
  g.__utente = tel;
  verifica((await generaChiaveBackup({}, fd({ conferma: "1" }))).errore, "una telefonista non può creare la chiave");
  g.__utente = ugo;
  const { chiave } = await generaChiaveBackup({}, fd({ conferma: "1" }));
  const salvate = await prisma.configurazione.findMany({ where: { chiave: { startsWith: "backup_" } } });
  verifica(chiave && chiave.length > 40 && !salvate.some((c) => c.valore.includes(chiave)), "chiave creata, nel database solo l'impronta");
  verifica((await elenco(req("/api/backup/elenco"))).status === 401, "senza chiave: 401");
  verifica((await elenco(req("/api/backup/elenco", "sbagliata"))).status === 401, "chiave sbagliata: 401");
  verifica((await tabella(req("/api/backup/tabella?nome=Cliente&parte=0&parti=1", "sbagliata"))).status === 401, "tabella con chiave sbagliata: 401");
  verifica((await tabella(req(`/api/backup/tabella?nome=${encodeURIComponent('Cliente"; DROP')}&parte=0&parti=1`, chiave))).status === 400, "nome di tabella strano: rifiutato");
  verifica((await tabella(req("/api/backup/tabella?nome=NonEsiste&parte=0&parti=1", chiave))).status === 404, "tabella che non c'è: 404");
  const sh = await (await script()).text();
  verifica(sh.startsWith("#!/bin/sh") && !sh.includes(chiave!) && sh.includes('URL="https://'), "lo script del NAS non contiene la chiave");

  console.log("2. Elenco: dati senza file, completo con i file");
  const dati = await (await elenco(req("/api/backup/elenco?tipo=dati", chiave))).text();
  const completo = await (await elenco(req("/api/backup/elenco?tipo=completo", chiave))).text();
  verifica(dati.includes("\nCliente 0 1") && !dati.includes("\nDocumento "), "backup dei dati senza Documento", dati.slice(0, 200));
  const auto = await (await elenco(req("/api/backup/elenco", chiave))).text();
  const oggiDomenica = new Date().toLocaleDateString("en-US", { timeZone: "Europe/Rome", weekday: "short" }) === "Sun";
  verifica(oggiDomenica ? auto.includes("# tipo completo") : auto.startsWith("# salta"), "di serie una volta a settimana: oggi il NAS chiama e ONE risponde «salta» (o completo se domenica)", auto.slice(0, 40));
  await prisma.configurazione.create({ data: { chiave: "backup_frequenza", valore: "OGNI_NOTTE" } });
  const ogni = await (await elenco(req("/api/backup/elenco", chiave))).text();
  verifica(ogni.includes(oggiDomenica ? "# tipo completo" : "# tipo dati"), "con «ogni notte» risponde con l'elenco");
  verifica(completo.includes("Documento 0 1") && completo.includes("_PermessoListino 0 1"), "completo con Documento e le tabelle di collegamento");

  console.log("3. Scarico come lo script del NAS (Documento e Cliente divisi in 3 parti per prova) e ripristino");
  const cartella = mkdtempSync(join(tmpdir(), "backup-one-"));
  const righe: [string, number, number][] = completo.split("\n").filter((l) => l && !l.startsWith("#")).flatMap((l): [string, number, number][] => {
    const [t] = l.split(" ");
    return t === "Documento" || t === "Cliente" ? [0, 1, 2].map((p): [string, number, number] => [t, p, 3]) : [[t, 0, 1]];
  });
  let byte = 0, righeCliente = 0;
  for (const [t, p, n] of righe) {
    const r = await tabella(req(`/api/backup/tabella?nome=${t}&parte=${p}&parti=${n}`, chiave));
    if (r.status !== 200) { verifica(false, `scarico ${t}.${p}`, r.status); continue; }
    const b = Buffer.from(await r.arrayBuffer());
    byte += b.length;
    if (t === "Cliente") righeCliente += gunzipSync(b).toString().split("\n").filter(Boolean).length;
    writeFileSync(join(cartella, `${t}.${p}.ndjson.gz`), b);
  }
  verifica(righeCliente === 2300, "le 3 parti di Cliente insieme hanno tutte le 2300 righe, senza doppioni", righeCliente);
  verifica(readdirSync(cartella).length === righe.length, `${righe.length} file gzip salvati (${Math.round(byte / 1024)} KB)`);

  const db2 = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_2 } } });
  const t2 = (await db2.$queryRawUnsafe<{ n: string }[]>(`SELECT tablename AS n FROM pg_tables WHERE schemaname='public'`)).map((r) => `"${r.n}"`);
  await db2.$executeRawUnsafe(`TRUNCATE ${t2.join(",")} CASCADE`);
  const caricate = await ripristina(cartella, { prisma: db2, log: () => undefined });
  verifica(caricate.Cliente === 2300 && caricate.Documento === 23, "ripristino: 2300 clienti e 23 documenti", caricate);
  const c1 = await prisma.cliente.findMany({ orderBy: { id: "asc" } });
  const c2 = await db2.cliente.findMany({ orderBy: { id: "asc" } });
  verifica(JSON.stringify(c1) === JSON.stringify(c2), "clienti identici (accenti, virgolette, a capo, date)");
  const u2 = await db2.utente.findMany({ orderBy: { id: "asc" } });
  verifica(JSON.stringify(await prisma.utente.findMany({ orderBy: { id: "asc" } })) === JSON.stringify(u2) && u2[0].visibileProvince.length === 2, "utenti identici (anche gli elenchi)");
  const d2 = await db2.documento.findMany({ orderBy: { nome: "asc" } });
  const d1 = await prisma.documento.findMany({ orderBy: { nome: "asc" } });
  verifica(d1.every((d, i) => Buffer.compare(Buffer.from(d.contenuto), Buffer.from(d2[i].contenuto)) === 0), "file dei documenti identici byte per byte");
  const b2 = await db2.brand.findFirst({ include: { utentiAutorizzati: true } });
  verifica(b2?.utentiAutorizzati[0]?.nome === "Cristina", "collegamenti molti-a-molti ripristinati");
  let rifiuta = "";
  try { await ripristina(cartella, { prisma: db2, log: () => undefined }); } catch (e) { rifiuta = String(e); }
  verifica(rifiuta.includes("già"), "un secondo ripristino sopra dati esistenti viene rifiutato", rifiuta);
  await db2.$disconnect();

  console.log("4. Resoconto del NAS e avviso se si ferma");
  const r = await fatto(req("/api/backup/fatto", chiave, { method: "POST", body: "tipo=completo&cartella=2026-11-29-completo&file=40&byte=123456&errori=0&durata=95&libero=900000000" }));
  const s = await situazioneBackup();
  verifica(r.status === 200 && s.stato.livello === "ok" && s.storico[0].cartella === "2026-11-29-completo" && s.ultimo?.liberoKB === 900000000, "resoconto salvato: stato ok", s);
  verifica((await fatto(req("/api/backup/fatto", "no", { method: "POST", body: "file=1" }))).status === 401, "resoconto senza chiave rifiutato");
  verifica("livello" in (await controllaBackup()) && posta.length === 0, "backup recente: nessuna email");
  const traDueGiorni = new Date(Date.now() + 40 * 3_600_000);
  const a = await controllaBackup(traDueGiorni);
  verifica(a.livello === "fermo" && posta.length === 1 && posta[0].a.includes("ugo@x.it"), "40 ore senza backup: email agli amministratori", a);
  await controllaBackup(traDueGiorni);
  verifica(posta.length === 1, "una sola email al giorno");
  await fatto(req("/api/backup/fatto", chiave, { method: "POST", body: "tipo=dati&cartella=2026-11-30-incompleto&file=30&byte=1&errori=2&durata=9" }));
  verifica((await situazioneBackup()).stato.livello === "errori", "backup con errori: segnalato");
  console.log(`\n${ok} ok, ${ko} falliti`);
  smtp.close();
  await prisma.$disconnect();
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
