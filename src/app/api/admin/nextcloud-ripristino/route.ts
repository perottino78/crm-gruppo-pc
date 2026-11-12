import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CHIAVI_NC, configNextcloud, salvaCalendariNextcloud } from "@/lib/calendario/nextcloud";
import { cancellaEvento } from "@/lib/calendario/caldav";

export const dynamic = "force-dynamic";
const SECRET = process.env.SEED_SECRET || "gpc-2026-seed-x7f2";
const MOTIVO = "Cancellato sul calendario Nextcloud";

/**
 * Dopo il collegamento a Nextcloud: cosa ha toccato la sincronizzazione negli appuntamenti di P&C ONE.
 * GET (sola lettura): ?persona=<parte del nome> per gli appuntamenti di una persona cambiati dal collegamento in poi.
 * POST: rimette in piedi gli appuntamenti annullati dalla sincronizzazione (P&C ONE ha la precedenza).
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const persona = req.nextUrl.searchParams.get("persona") ?? "";
  const dal = new Date(req.nextUrl.searchParams.get("dal") ?? Date.now() - 2 * 86_400_000);
  const cfg = await configNextcloud();
  const utenti = await prisma.utente.findMany({ where: persona ? { nome: { contains: persona, mode: "insensitive" } } : {}, select: { id: true, nome: true } });
  const ids = utenti.map((u) => u.id);
  const [annullatiDaNc, cambiati, eventi, ultima] = await Promise.all([
    prisma.appuntamento.findMany({ where: { esito: MOTIVO }, select: { id: true, utenteId: true, dataOra: true, stato: true, titolo: true, updatedAt: true } }),
    prisma.appuntamento.findMany({ where: { utenteId: { in: ids }, updatedAt: { gte: dal } }, select: { id: true, dataOra: true, durataMin: true, stato: true, esito: true, titolo: true, chiaveImport: true, updatedAt: true }, orderBy: { updatedAt: "asc" } }),
    prisma.eventoNextcloud.groupBy({ by: ["utenteId", "calendario"], _count: true, where: { utenteId: { in: ids } } }),
    prisma.configurazione.findUnique({ where: { chiave: CHIAVI_NC.stato } }),
  ]);
  return NextResponse.json({
    stato: ultima?.valore ?? null,
    calendari: cfg.calendari.map((c) => ({ nome: c.nome, persona: utenti.find((u) => u.id === c.utenteId)?.nome ?? (c.utenteId ? "altra persona" : null), scrivi: c.scrivi })),
    persone: utenti.map((u) => u.nome),
    annullatiDaNextcloud: annullatiDaNc.length,
    cambiatiDal: dal.toISOString(),
    cambiati,
    eventiNextcloud: eventi,
  });
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-seed-key") !== SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const prova = q.get("esegui") !== "1";
  // «nonscrivere»: toglie la spunta «Scrivi qui» a tutti i calendari e cancella da Nextcloud gli impegni scritti da P&C ONE
  if (q.get("azione") === "nonscrivere") {
    const cfg = await configNextcloud();
    const scritti = await prisma.eventoNextcloud.findMany({ where: { chiave: { not: null } }, select: { id: true, href: true } });
    let tolti = 0; const errori: string[] = [];
    if (!prova) {
      await salvaCalendariNextcloud(cfg.calendari.map((c) => ({ ...c, scrivi: false })));
      for (const s of scritti) {
        try { if (cfg.dav) await cancellaEvento(cfg.dav, s.href); await prisma.eventoNextcloud.delete({ where: { id: s.id } }); tolti++; }
        catch (e) { errori.push(e instanceof Error ? e.message : String(e)); }
      }
    }
    return NextResponse.json({ prova, calendariConScrivi: cfg.calendari.filter((c) => c.scrivi).length, impegniScritti: scritti.length, tolti, errori: errori.slice(0, 5) });
  }
  // finestra in cui ha girato la vecchia sincronizzazione (quella che annullava): solo gli appuntamenti toccati lì
  const dal = new Date(q.get("dal") ?? "1970-01-01"), al = new Date(q.get("al") ?? Date.now());
  const toccati = await prisma.appuntamento.findMany({ where: { stato: "ANNULLATO", updatedAt: { gte: dal, lte: al } }, select: { id: true, esito: true, dataOra: true, titolo: true } });
  // annullati solo dalla sincronizzazione → di nuovo in programma; con un esito scritto dal venditore (era già svolto) → svolti;
  // annullati da una persona («Annullato (…)») restano come sono
  const daProgrammare = toccati.filter((a) => a.esito === MOTIVO);
  const daSvolti = toccati.filter((a) => a.esito && a.esito !== MOTIVO && !/^Annullat/i.test(a.esito));
  if (!prova) {
    await prisma.appuntamento.updateMany({ where: { id: { in: daProgrammare.map((a) => a.id) } }, data: { stato: "PROGRAMMATO", esito: null } });
    await prisma.appuntamento.updateMany({ where: { id: { in: daSvolti.map((a) => a.id) } }, data: { stato: "COMPLETATO" } });
  }
  return NextResponse.json({ prova, rimessiInProgramma: daProgrammare.length, rimessiSvolti: daSvolti.length, lasciatiAnnullati: toccati.length - daProgrammare.length - daSvolti.length });
}
