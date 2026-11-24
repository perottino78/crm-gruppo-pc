// Ripristino di un backup del NAS in un database (in caso di disastro). Lo usa il tecnico, MAI sul database di produzione pieno.
//
//   1. database nuovo e vuoto, con le tabelle della stessa versione del backup:
//        DATABASE_URL=<nuovo> npx prisma db push --skip-generate
//      (la versione del codice è nella riga «# versione …» di elenco.txt nella cartella del backup)
//   2. DATABASE_URL=<nuovo> npx tsx scripts/backup/ripristina.ts "<cartella del backup>" --conferma
//      Con un backup «dati» (non completo) mancano foto e documenti: si può aggiungere poi la cartella dell'ultimo
//      «-completo» con --solo-file (carica solo le tabelle dei file).
//
// Rifiuta di scrivere in tabelle che hanno già righe. Le righe sono quelle di row_to_json: si rimettono con json_populate_recordset.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";
import { TABELLE_FILE } from "../../src/lib/backup/regole";

const BLOCCO_BYTE = 4 * 1024 ** 2;

export async function ripristina(cartella: string, opz: { soloFile?: boolean; prisma?: PrismaClient; log?: (s: string) => void } = {}) {
  const db = opz.prisma ?? new PrismaClient();
  const log = opz.log ?? console.log;
  const perTabella = new Map<string, string[]>();
  for (const f of readdirSync(cartella).filter((x) => x.endsWith(".ndjson.gz")).sort()) {
    const t = f.replace(/\.\d+\.ndjson\.gz$/, "");
    if (opz.soloFile && !(TABELLE_FILE as readonly string[]).includes(t)) continue;
    perTabella.set(t, [...(perTabella.get(t) ?? []), join(cartella, f)]);
  }
  if (!perTabella.size) throw new Error(`Nessun file .ndjson.gz in ${cartella}`);
  const esistenti = new Set((await db.$queryRawUnsafe<{ n: string }[]>(`SELECT tablename AS n FROM pg_tables WHERE schemaname = 'public'`)).map((r) => r.n));
  for (const t of perTabella.keys()) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) throw new Error(`Nome di tabella strano: ${t}`);
    if (!esistenti.has(t)) throw new Error(`La tabella ${t} non c'è nel database: fai prima «prisma db push» con la versione del backup.`);
    const [{ n }] = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t}"`);
    if (Number(n) > 0) throw new Error(`La tabella ${t} ha già ${n} righe: il ripristino va fatto in un database vuoto.`);
  }

  // senza controlli dei collegamenti (se il database lo permette); altrimenti più giri finché le tabelle «madri» sono dentro
  let senzaVincoli = false;
  try { await db.$executeRawUnsafe(`SET session_replication_role = replica`); senzaVincoli = true; } catch { /* serve il proprietario: più giri */ }

  const carica = async (t: string) => {
    let righe = 0;
    await db.$transaction(async (tx) => {
      if (senzaVincoli) await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
      for (const f of perTabella.get(t)!) {
        const linee = gunzipSync(readFileSync(f)).toString("utf8").split("\n").filter(Boolean);
        let blocco: string[] = [], byte = 0;
        const scrivi = async () => {
          if (!blocco.length) return;
          righe += await tx.$executeRawUnsafe(`INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`, `[${blocco.join(",")}]`);
          blocco = []; byte = 0;
        };
        for (const l of linee) { blocco.push(l); byte += l.length; if (byte > BLOCCO_BYTE) await scrivi(); }
        await scrivi();
      }
    }, { timeout: 600_000, maxWait: 60_000 });
    return righe;
  };

  let daFare = [...perTabella.keys()];
  const fatte: Record<string, number> = {};
  for (let giro = 1; daFare.length && giro <= 12; giro++) {
    const rimaste: string[] = [];
    let ultimoErrore = "";
    for (const t of daFare) {
      try { fatte[t] = await carica(t); log(`✓ ${t}: ${fatte[t]} righe`); }
      catch (e) { rimaste.push(t); ultimoErrore = String(e).slice(0, 300); }
    }
    if (rimaste.length === daFare.length) throw new Error(`Non riesco a caricare: ${rimaste.join(", ")}. Ultimo errore: ${ultimoErrore}`);
    daFare = rimaste;
  }
  // contatori automatici (es. Assistenza.numero): ripartono dal più alto ripristinato
  const contatori = await db.$queryRawUnsafe<{ t: string; c: string; seq: string }[]>(`
    SELECT table_name AS t, column_name AS c, pg_get_serial_sequence(format('%I', table_name), column_name) AS seq
    FROM information_schema.columns WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'`);
  for (const k of contatori) {
    if (!k.seq || !(k.t in fatte)) continue;
    await db.$executeRawUnsafe(`SELECT setval('${k.seq.replace(/'/g, "''")}', COALESCE((SELECT max("${k.c}") FROM "${k.t}"), 0) + 1, false)`);
  }
  if (!opz.prisma) await db.$disconnect();
  return fatte;
}

if (process.argv[1]?.endsWith("ripristina.ts")) {
  const [cartella, ...flag] = process.argv.slice(2);
  if (!cartella || !flag.includes("--conferma")) {
    console.log('Uso: DATABASE_URL=<database nuovo> npx tsx scripts/backup/ripristina.ts "<cartella del backup>" --conferma [--solo-file]');
    process.exit(1);
  }
  ripristina(cartella, { soloFile: flag.includes("--solo-file") })
    .then((f) => { console.log(`Fatto: ${Object.keys(f).length} tabelle.`); })
    .catch((e) => { console.error(String(e)); process.exit(1); });
}
