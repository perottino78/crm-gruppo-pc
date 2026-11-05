import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const ok = (req: NextRequest) => (req.headers.get("x-seed-key") || req.nextUrl.searchParams.get("key")) === SECRET;

type Fk = { tabella: string; colonna: string };
/** Tutte le colonne del database che puntano a un utente (chiavi esterne verso "Utente".id), lette da Postgres. */
async function colonneUtente(): Promise<Fk[]> {
  return prisma.$queryRawUnsafe<Fk[]>(`
    select tc.table_name as tabella, kcu.column_name as colonna
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and ccu.table_name = 'Utente' and ccu.column_name = 'id' and tc.table_schema = current_schema()`);
}
const q = (s: string) => `"${s.replace(/"/g, "")}"`;
/** Colonne con l'id di un utente ma senza chiave esterna nel database. */
const SENZA_FK: Fk[] = [
  ["Lead", "venditoreId"], ["Soggetto", "utenteId"], ["FaseCommessa", "assegnatoUtenteId"], ["Posa", "assegnatoUtenteId"], ["Assistenza", "assegnatoUtenteId"],
  ["TaskPratica", "assegnatoUtenteId"], ["VistaSalvata", "utenteId"], ["Campagna", "commercialeId"], ["ZonaCommerciale", "responsabileId"], ["ComunicazioneDestinatario", "utenteId"],
].map(([tabella, colonna]) => ({ tabella, colonna }));
async function tutteLeColonne(): Promise<Fk[]> {
  const fks = await colonneUtente();
  return [...fks, ...SENZA_FK.filter((x) => !fks.some((f) => f.tabella === x.tabella && f.colonna === x.colonna))];
}

async function conteggi(id: string, fks: Fk[]) {
  const out: Record<string, number> = {};
  for (const f of fks) {
    const [r] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) as n from ${q(f.tabella)} where ${q(f.colonna)} = $1`, id);
    if (Number(r.n)) out[`${f.tabella}.${f.colonna}`] = Number(r.n);
  }
  return out;
}

// Solo uso tecnico (x-seed-key). GET ?nome=… elenca gli utenti con quel nome e quanti dati hanno.
// POST { tieni, elimina, prova } sposta TUTTO dall'utente doppione a quello da tenere, poi elimina il doppione.
export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const nome = req.nextUrl.searchParams.get("nome") ?? "";
  const fks = await tutteLeColonne();
  const utenti = await prisma.utente.findMany({ where: { nome: { contains: nome, mode: "insensitive" } }, select: { id: true, nome: true, username: true, email: true, ruolo: true, stato: true, passwordHash: true, mustChangePassword: true, createdAt: true, telefono: true, firmaEmail: true, smtpUtente: true, smtpPassword: true, calendarioToken: true, provvigionePercentuale: true } });
  const out = [];
  for (const u of utenti) {
    const { smtpPassword, firmaEmail, calendarioToken, ...resto } = u;
    out.push({ ...resto, passwordHash: !!u.passwordHash, casellaCollegata: !!smtpPassword, firma: !!firmaEmail, calendario: !!calendarioToken, dati: await conteggi(u.id, fks) });
  }
  return NextResponse.json({ utenti: out });
}

export async function POST(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { tieni?: string; elimina?: string; prova?: boolean; prendiEmail?: boolean };
  if (!b.tieni || !b.elimina || b.tieni === b.elimina) return NextResponse.json({ error: "tieni/elimina" }, { status: 400 });
  const [tieni, elimina] = await Promise.all([prisma.utente.findUnique({ where: { id: b.tieni } }), prisma.utente.findUnique({ where: { id: b.elimina } })]);
  if (!tieni || !elimina) return NextResponse.json({ error: "utente non trovato" }, { status: 404 });
  const fks = await tutteLeColonne();
  const spostati: Record<string, number> = {};
  const scartatiDoppi: Record<string, number> = {};
  const copiati: string[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      for (const f of fks) {
        if (f.tabella === "Utente") continue;
        await tx.$executeRawUnsafe(`savepoint s`);
        try {
          const n = await tx.$executeRawUnsafe(`update ${q(f.tabella)} set ${q(f.colonna)} = $1 where ${q(f.colonna)} = $2`, tieni.id, elimina.id);
          if (n) spostati[`${f.tabella}.${f.colonna}`] = n;
          await tx.$executeRawUnsafe(`release savepoint s`);
        } catch {
          // stessa riga già presente per l'utente da tenere (es. tabelle di collegamento): si tiene la sua, si toglie il doppione
          await tx.$executeRawUnsafe(`rollback to savepoint s`);
          const n = await tx.$executeRawUnsafe(`delete from ${q(f.tabella)} where ${q(f.colonna)} = $1`, elimina.id);
          if (n) scartatiDoppi[`${f.tabella}.${f.colonna}`] = n;
        }
      }
      // riferimenti senza chiave esterna: elenchi di colleghi visibili e telefonista per marchio
      await tx.$executeRawUnsafe(`update "Utente" set "visibileUtenti" = array_replace("visibileUtenti", $2, $1) where $2 = any("visibileUtenti")`, tieni.id, elimina.id);
      await tx.configurazione.updateMany({ where: { chiave: { startsWith: "lead_telefonista_" }, valore: elimina.id }, data: { valore: tieni.id } });
      await tx.utente.delete({ where: { id: elimina.id } });
      // dati della scheda che il doppione ha e quello da tenere no (casella email, firma, telefono…); l'email solo se richiesto
      const vuoto = (v: unknown) => v === null || v === undefined || v === "";
      const dati: Record<string, unknown> = {};
      for (const k of ["telefono", "firmaEmail", "provvigionePercentuale", "smtpUtente", "smtpPassword", "smtpHost", "smtpPorta", "smtpVerificataIl"] as const) {
        if (vuoto(tieni[k]) && !vuoto(elimina[k])) dati[k] = elimina[k];
      }
      if (b.prendiEmail) dati.email = elimina.email;
      if (Object.keys(dati).length) await tx.utente.update({ where: { id: tieni.id }, data: dati });
      copiati.push(...Object.keys(dati).map((k) => (k === "smtpPassword" ? "casella email" : k)));
      if (b.prova) throw new Error("PROVA");
    }, { timeout: 60_000 });
  } catch (e) {
    if ((e as Error).message !== "PROVA") return NextResponse.json({ error: (e as Error).message.slice(0, 300) }, { status: 500 });
    return NextResponse.json({ prova: true, tieni: tieni.nome, elimina: elimina.nome, spostati, scartatiDoppi, copiati });
  }
  return NextResponse.json({ fatto: true, tieni: tieni.nome, elimina: elimina.nome, spostati, scartatiDoppi, copiati });
}
