// Collaudo: task come corrispondenza interna (commenti, in copia a, chiusura con risposta, file, task di pratica); server SMTP finto.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/task-corrispondenza.collaudo.ts
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
import { creaTaskCliente } from "../../src/app/task-clienti-actions";
import { commentaTask, salvaInfoTask, salvaDescrizioneTask, commentaTaskPratica } from "../../src/app/task-actions";
import { caricaDocumenti } from "../../src/app/documenti-actions";
import { puoVedereTask } from "../../src/lib/task/permessi";
import { assicuraFlusso } from "../../src/app/flusso-actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const redirectA = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const d = (e as { digest?: string }).digest ?? String(e); if (!d.includes("NEXT_REDIRECT")) throw e; return decodeURIComponent((d.split(";")[2] ?? "").replace(/\+/g, " ")); } };
const modulo = (o: Record<string, string | string[]>, file?: File[]) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x); for (const x of file ?? []) f.append("file", x); return f; };
const leggibile = (s: string) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_t, h) => String.fromCharCode(parseInt(h, 16)));

async function main() {
  await new Promise<void>((r) => smtp.listen(2533, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2533", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "TaskCommento","TaskPratica","Commessa","Attivita","Documento","Preventivo","Configurazione","Utente","Brand","Cliente","FlussoFase" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const mk = (nome: string, user: string, ruolo: string, ufficio?: string) => prisma.utente.create({ data: { nome, email: `${user}@gruppopec.com`, username: user, ruolo, ...(ufficio ? { ufficio } : {}) } });
  const ale = await mk("Alessia Vaccaro", "alessia", "AMMINISTRATIVO", "CENTRALINO");
  const ugo = await mk("Ugo Perottino", "ugo", "AMMINISTRATORE");
  const deb = await mk("Debora Rossi", "debora", "AMMINISTRATIVO", "AMMINISTRAZIONE");
  const marco = await mk("Marco Verdi", "marco", "COMMERCIALE");
  const cliente = await prisma.cliente.create({ data: { nome: "Rumiano Riccardo", brandId: brand.id, responsabileId: ale.id } });

  console.log("1. Alessia apre un task per Ugo, con Debora in copia, categoria e ore");
  g.__utente = ale;
  const r1 = await redirectA(creaTaskCliente(modulo({ clienteId: cliente.id, oggetto: "Richiesta preventivo", descrizione: "Smontaggio e rimontaggio pergola", utenteId: ugo.id, inCopiaA: [deb.id], categoria: "Richiesta preventivo", orePreviste: "1", apri: "1" })));
  const t = await prisma.attivita.findFirstOrThrow({ where: { tipo: "TASK" } });
  verifica(r1?.startsWith(`/task/${t.id}`) && t.categoria === "Richiesta preventivo" && t.orePreviste === 1 && t.inCopiaA.includes(deb.id) && t.statoTask === "DA_FARE", "task creato e aperto con i suoi dati", [r1, t]);
  verifica(posta.some((m) => m.a.includes("ugo@gruppopec.com")) && posta.some((m) => m.a.includes("debora@gruppopec.com") && leggibile(m.dati).includes("In copia")), "avvisati Ugo (incaricato) e Debora (in copia)", posta.map((m) => m.a));

  console.log("2. Chi è coinvolto lo vede, un altro no");
  verifica(await puoVedereTask(deb, t.id) && await puoVedereTask(ugo, t.id) && await puoVedereTask(ale, t.id), "creatore, incaricato e in copia vedono il task");
  verifica(!(await puoVedereTask(marco, t.id)), "un commerciale senza il cliente no");

  console.log("3. Ugo risponde con un commento e poi chiude dicendo cosa ha fatto");
  g.__utente = ugo;
  const n0 = posta.length;
  await redirectA(commentaTask(modulo({ id: t.id, testo: "Ho sentito il cliente: serve un sopralluogo", notifica: "1" })));
  verifica((await prisma.taskCommento.count({ where: { attivitaId: t.id } })) === 1 && posta.length > n0 && posta.slice(n0).every((m) => !m.a.includes("ugo@gruppopec.com")), "commento salvato e avviso agli altri (non all'autore)");
  const n1 = posta.length;
  const r3 = await redirectA(commentaTask(modulo({ id: t.id, testo: "Preventivo inviato, sopralluogo fissato per giovedì", chiudi: "1" })));
  const chiuso = await prisma.attivita.findUniqueOrThrow({ where: { id: t.id } });
  const ultimo = await prisma.taskCommento.findFirstOrThrow({ where: { attivitaId: t.id }, orderBy: { createdAt: "desc" } });
  verifica(chiuso.completata && chiuso.statoTask === "FATTO" && ultimo.chiusura && r3?.includes("Task chiuso"), "chiuso con la risposta di chiusura", [r3, chiuso.statoTask]);
  verifica(posta.length > n1 && posta.slice(n1).some((m) => m.a.includes("alessia@gruppopec.com") && leggibile(m.dati).includes("sopralluogo fissato")), "chi aveva aperto il task riceve cosa è stato fatto");

  console.log("4. Info sul task: riassegna, riapre, cambia stato");
  await redirectA(salvaInfoTask(modulo({ id: t.id, utenteId: marco.id, statoTask: "IN_CORSO", categoria: "Assistenza", orePreviste: "2,5", scadenza: "2026-12-01", notifica: "1", inCopiaA: [deb.id, ale.id] })));
  const dopo = await prisma.attivita.findUniqueOrThrow({ where: { id: t.id } });
  verifica(dopo.utenteId === marco.id && !dopo.completata && dopo.statoTask === "IN_CORSO" && dopo.orePreviste === 2.5 && dopo.inCopiaA.length === 2 && dopo.categoria === "Assistenza", "riassegnato, riaperto e dati aggiornati", dopo);
  verifica(await puoVedereTask(marco, t.id), "il nuovo incaricato lo vede");
  await redirectA(salvaDescrizioneTask(modulo({ id: t.id, oggetto: "Richiesta preventivo pergola", descrizione: "Descrizione aggiornata" })));
  verifica((await prisma.attivita.findUniqueOrThrow({ where: { id: t.id } })).descrizione === "Descrizione aggiornata", "descrizione modificabile");

  console.log("5. File del task");
  const res = await caricaDocumenti(null, modulo({ entita: "TASK", entitaId: t.id, cartella: "Allegati" }, [new File([new Uint8Array([37, 80, 68, 70])], "foto-pergola.pdf", { type: "application/pdf" })]));
  verifica(res.ok && (await prisma.documento.count({ where: { entita: "TASK", entitaId: t.id } })) === 1, "allegato caricato sul task", res);

  console.log("6. Task di pratica fra uffici: commento e «segna Fatto»");
  await assicuraFlusso();
  const prev = await prisma.preventivo.create({ data: { clienteId: cliente.id, brandId: brand.id, commercialeId: ugo.id } });
  const com = await prisma.commessa.create({ data: { numero: 1, anno: 2026, preventivoId: prev.id, clienteId: cliente.id, brandId: brand.id } });
  const tp = await prisma.taskPratica.create({ data: { commessaId: com.id, faseChiave: "POSA", ufficio: "POSA", titolo: "Eseguire la posa" } });
  g.__utente = deb;
  await commentaTaskPratica(modulo({ taskId: tp.id, testo: "Squadra avvisata" }));
  verifica((await prisma.taskCommento.count({ where: { taskPraticaId: tp.id } })) === 1 && !(await prisma.taskPratica.findUniqueOrThrow({ where: { id: tp.id } })).completatoIl, "commento sul task di pratica");
  await commentaTaskPratica(modulo({ taskId: tp.id, testo: "Posa finita, documenti consegnati", chiudi: "1" }));
  const tpDopo = await prisma.taskPratica.findUniqueOrThrow({ where: { id: tp.id } });
  verifica(!!tpDopo.completatoIl && (await prisma.taskCommento.count({ where: { taskPraticaId: tp.id, chiusura: true } })) === 1, "«commenta e segna Fatto» chiude il task con la risposta");

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  smtp.close();
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); smtp.close(); await prisma.$disconnect(); process.exit(1); });
