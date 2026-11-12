// Collaudo: campagne di Rocco (nome modificabile, duplica ed elimina dall'elenco, A/B test a gruppi) con un server SMTP finto.
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/campagne-ab.collaudo.ts
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
import { chiaveGiorno } from "../../src/lib/calendario/tempo";
import { creaCampagna, salvaCampagna, inviaCampagna, rinominaCampagna, duplicaCampagna, eliminaCampagna, impostaAbTest, provaCampagna, programmaCampagna, annullaProgrammazione } from "../../src/app/campagne-actions";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const dove = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { const x = (e as { digest?: string }).digest ?? ""; if (!x.startsWith("NEXT_REDIRECT")) throw e; return decodeURIComponent(x.split(";")[2] ?? ""); } };
const idDa = (url: string | null) => url?.match(/\/campagne\/([a-z0-9]+)/)?.[1] ?? "";
/** oggetto dell'email (anche codificato MIME) */
const oggetto = (dati: string) => {
  const m = dati.match(/^Subject: (.*(?:\r\n[ \t].*)*)/m)?.[1] ?? "";
  return m.replace(/\r\n[ \t]/g, " ").replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=\s*/gi, (_, t, s) =>
    t.toUpperCase() === "B" ? Buffer.from(s, "base64").toString("utf8") : Buffer.from(s.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_x: string, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8"));
};
const corpo = (dati: string) => dati.replace(/=\r\n/g, "").replace(/=3D/g, "=");


async function main() {
  await new Promise<void>((r) => smtp.listen(2532, r));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2532", SMTP_USER: "crm@gruppopec.com", SMTP_PASS: "x" });
  await prisma.$executeRawUnsafe('TRUNCATE "CampagnaInvio","CampagnaVariante","Campagna","Lead","Cliente","Configurazione","Utente","Brand" CASCADE');
  const pc = await prisma.brand.create({ data: { nome: "P&C" } });
  const rocco = await prisma.utente.create({ data: { nome: "Rocco Zaccaro", email: "rocco@x.it", username: "rocco", ruolo: "MARKETING" } });
  for (let i = 0; i < 10; i++) await prisma.cliente.create({ data: { nome: `Cliente ${i}`, brandId: pc.id, email: `c${i}@x.it`, statoLead: "Non interessato" } });
  g.__utente = rocco;

  console.log("1. Nuovo A/B test e nome modificabile");
  const id = idDa(await dove(creaCampagna(fd({ ab: "1", nome: "Pergole primavera" }))));
  let c = await prisma.campagna.findUniqueOrThrow({ where: { id }, include: { varianti: { orderBy: { posizione: "asc" } } } });
  verifica(c.abTest && c.varianti.map((v) => v.nome).join(",") === "Gruppo A,Gruppo B", "nasce con 2 gruppi (A e B)", c.varianti.map((v) => v.nome));
  await dove(rinominaCampagna(fd({ id, nome: "Pergole primavera 2027" })));
  verifica((await prisma.campagna.findUniqueOrThrow({ where: { id } })).nome === "Pergole primavera 2027", "il nome si cambia dal titolo");

  console.log("2. Tre gruppi con nome e versione propria");
  const gruppi: Record<string, string> = { id, stati: "Non interessato", gruppi: "3", tracciamento: "on" };
  ["Sconto", "Posa gratis", "Domanda"].forEach((n, i) => Object.assign(gruppi, { [`g${i}_id`]: c.varianti[i]?.id ?? "", [`g${i}_nome`]: n, [`g${i}_oggetto`]: `{nome}: versione ${n}`, [`g${i}_preheader`]: `pre ${n}`, [`g${i}_formato`]: "TESTO", [`g${i}_testo`]: `Ciao {nome}, testo ${n}` }));
  const salvato = await dove(salvaCampagna(fd(gruppi)));
  c = await prisma.campagna.findUniqueOrThrow({ where: { id }, include: { varianti: { orderBy: { posizione: "asc" } } } });
  verifica(salvato?.includes("ok=") && c.varianti.length === 3 && c.varianti[2].nome === "Domanda" && c.varianti[1].preheader === "pre Posa gratis", "3 gruppi salvati con nome, oggetto, preheader e testo", c.varianti.map((v) => v.nome));
  verifica(c.nome === "Pergole primavera 2027", "salvare il modulo non tocca il nome");

  console.log("3. Prova e invio diviso in parti uguali");
  const prova = await dove(provaCampagna(fd({ id, a: "rocco@x.it" })));
  verifica(prova?.replace(/\+/g, " ").includes("3 email di prova") && posta.length === 3 && oggetto(posta[1].dati).includes("[PROVA · Posa gratis]"), "prova: una email per gruppo con il nome nell'oggetto", prova);
  posta.length = 0;
  await dove(inviaCampagna(fd({ id })));
  const invii = await prisma.campagnaInvio.findMany({ where: { campagnaId: id } });
  const per = c.varianti.map((v) => invii.filter((i) => i.varianteId === v.id).length);
  verifica(invii.length === 10 && per.sort().join() === "3,3,4", "10 contatti divisi 4/3/3", per);
  await eseguiCampagne({ max: 50 });
  const oggetti = posta.map((m) => oggetto(m.dati));
  verifica(posta.length === 10 && ["Sconto", "Posa gratis", "Domanda"].every((n) => oggetti.some((o) => o.includes(`versione ${n}`))), "ognuno riceve la versione del suo gruppo", oggetti);
  const inv0 = (await prisma.campagnaInvio.findFirstOrThrow({ where: { campagnaId: id, email: posta[0].a[0] }, include: { variante: true } }));
  verifica(oggetto(posta[0].dati).includes(inv0.variante!.nome) && corpo(posta[0].dati).includes(`testo ${inv0.variante!.nome}`), "oggetto e testo corrispondono al gruppo registrato", inv0.variante?.nome);

  console.log("4. Nuovi contatti: i gruppi restano pari; i gruppi già partiti non si tolgono");
  for (let i = 10; i < 12; i++) await prisma.cliente.create({ data: { nome: `Cliente ${i}`, brandId: pc.id, email: `c${i}@x.it`, statoLead: "Non interessato" } });
  await dove(inviaCampagna(fd({ id })));
  const conti2 = await Promise.all(c.varianti.map((v) => prisma.campagnaInvio.count({ where: { varianteId: v.id } })));
  verifica(conti2.sort().join() === "4,4,4", "12 contatti: 4/4/4", conti2);
  const togli = await dove(salvaCampagna(fd({ ...gruppi, gruppi: "2" })));
  verifica(togli?.includes("errore=") && (await prisma.campagnaVariante.count({ where: { campagnaId: id } })) === 3, "non si scende sotto i gruppi già partiti", togli);
  const spegni = await dove(impostaAbTest(fd({ id, attivo: "0" })));
  verifica(spegni?.includes("errore="), "una campagna partita a gruppi non torna a email unica", spegni);

  console.log("5. Duplica ed elimina dall'elenco");
  const lista = await dove(duplicaCampagna(fd({ id, resta: "1" })));
  const copia = await prisma.campagna.findFirstOrThrow({ where: { nome: "Pergole primavera 2027 (copia)" }, include: { varianti: true, _count: { select: { invii: true } } } });
  verifica(lista?.startsWith("/campagne?ok=") && copia.abTest && copia.varianti.length === 3 && copia._count.invii === 0, "duplica: resta sull'elenco, copia con i 3 gruppi e senza invii", lista);
  const el = await dove(eliminaCampagna(fd({ id })));
  verifica(el?.includes("eliminata") && !(await prisma.campagna.findUnique({ where: { id } })) && !(await prisma.campagnaInvio.count({ where: { campagnaId: id } })), "anche una campagna già inviata si elimina (con i suoi invii)", el);

  console.log("6. Campagna normale: A/B acceso dalla pagina parte dalla versione salvata");
  const n = idDa(await dove(creaCampagna(fd({ nome: "Normale" }))));
  await dove(salvaCampagna(fd({ id: n, oggetto: "Ciao {nome}", formato: "TESTO", testo: "Testo base" })));
  await dove(impostaAbTest(fd({ id: n, attivo: "1" })));
  const vs = await prisma.campagnaVariante.findMany({ where: { campagnaId: n } });
  verifica(vs.length === 2 && vs.every((v) => v.oggetto === "Ciao {nome}" && v.testo === "Testo base"), "due gruppi copiati dalla versione salvata");

  console.log("7. Invio programmato");
  const fra = (ore: number) => new Date(Date.now() + ore * 3_600_000);
  const oraRoma = (d: Date) => d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
  await dove(salvaCampagna(fd({ id: n, oggetto: "Ciao {nome}", formato: "TESTO", testo: "Testo base", stati: "Non interessato" })));
  await dove(impostaAbTest(fd({ id: n, attivo: "0" })));
  const passato = await dove(programmaCampagna(fd({ id: n, giorno: chiaveGiorno(fra(-2)), ora: oraRoma(fra(-2)) })));
  verifica(passato?.includes("errore="), "un'ora già passata è rifiutata", passato);
  const t = fra(2);
  const prog = await dove(programmaCampagna(fd({ id: n, giorno: chiaveGiorno(t), ora: oraRoma(t) })));
  let k = await prisma.campagna.findUniqueOrThrow({ where: { id: n } });
  verifica(prog?.includes("ok=") && k.stato === "PROGRAMMATA" && !!k.programmataIl && Math.abs(k.programmataIl.getTime() - t.getTime()) < 60_000, "programmata all'ora scelta (ora di Roma)", { prog, p: k.programmataIl });
  posta.length = 0;
  await eseguiCampagne({ adesso: () => fra(1), max: 50 });
  verifica(posta.length === 0 && (await prisma.campagnaInvio.count({ where: { campagnaId: n } })) === 0, "prima dell'ora non parte niente");
  await eseguiCampagne({ adesso: () => fra(3), max: 50 });
  k = await prisma.campagna.findUniqueOrThrow({ where: { id: n } });
  verifica(posta.length === 12 && k.stato === "INVIATA", "all'ora scelta parte da sola a tutti (12)", { n: posta.length, stato: k.stato });
  const t2 = fra(5);
  await dove(programmaCampagna(fd({ id: n, giorno: chiaveGiorno(t2), ora: oraRoma(t2) })));
  await dove(annullaProgrammazione(fd({ id: n })));
  k = await prisma.campagna.findUniqueOrThrow({ where: { id: n } });
  verifica(k.stato === "INVIATA" && !k.programmataIl, "programmazione annullata: torna com'era (già inviata)", k.stato);

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  smtp.close();
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
