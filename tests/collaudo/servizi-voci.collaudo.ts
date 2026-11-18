// Servizi del listino (Posa, Trasporto, Assistenza tecnica): creati una volta, prezzi e voci modificabili senza che il seed li riscriva.
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { POST } from "../../src/app/api/admin/seed-servizi/route";
import * as S from "../../src/app/servizi-actions";
let ok = 0, ko = 0;
const verifica = (c: unknown, m: string, x?: unknown) => { if (c) { ok++; console.log("  ✓", m); } else { ko++; console.log("  ✗", m, x ?? ""); } };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const senza = async (p: Promise<unknown>) => { try { await p; return ""; } catch (e) { return String((e as { digest?: string; message?: string }).digest ?? (e as Error).message); } };
const seed = () => POST(new NextRequest("http://x/api/admin/seed-servizi", { method: "POST", headers: { "x-seed-key": process.env.SEED_SECRET || "gpc-2026-seed-x7f2" } })).then((r) => r.json());
(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "Prodotto","ModelloProdotto","Optional","Brand" CASCADE');
  const u = await prisma.utente.findFirst({ where: { ruolo: "AMMINISTRATORE" } }) ?? await prisma.utente.create({ data: { nome: "Admin", email: "a@a.it", username: "admin", passwordHash: "x", ruolo: "AMMINISTRATORE" } as never });
  (globalThis as { __utente?: unknown }).__utente = u;
  await prisma.brand.createMany({ data: [{ nome: "P&C" }, { nome: "Solaris" }] });
  const r1 = await seed();
  verifica(r1.ok, "seed eseguito", r1);
  const nBrand = await prisma.brand.count();
  const call = await prisma.prodotto.findMany({ where: { tipologia: "SERVIZI_ASSISTENZA" } });
  verifica(call.length === 2 * nBrand && call.every((p) => p.prezzoBase === 80), "Assistenza tecnica: costo chiamata e assistenza a orario a 80 € in ogni marchio", call.map((p) => [p.colore, p.prezzoBase]));
  verifica((await prisma.prodotto.count({ where: { tipologia: "SERVIZI_POSA" } })) === 3 * nBrand && (await prisma.prodotto.count({ where: { tipologia: "SERVIZI_TRASPORTO" } })) === 2 * nBrand, "Posa (3 voci) e Trasporto (2 voci) creati, prezzi da definire");
  const m = await prisma.modelloProdotto.findFirstOrThrow({ where: { tipologia: "SERVIZI_POSA" } });
  verifica(m.immagineUrl === "/immagini/servizi/posa.svg" && m.famiglia === "SERVIZI", "immagine e posizione nel listino", [m.immagineUrl, m.famiglia]);
  // modifica a mano: nome e prezzo, valida per tutti i marchi
  await senza(S.salvaVoceServizio(fd({ tipologia: "SERVIZI_POSA", nomeOriginale: "Posa a ore (per ora)", nome: "Posa a ore (2 operai)", prezzo: "65,50" })));
  const mod = await prisma.prodotto.findMany({ where: { tipologia: "SERVIZI_POSA", colore: "Posa a ore (2 operai)" } });
  verifica(mod.length === nBrand && mod.every((p) => p.prezzoBase === 65.5), "voce rinominata e prezzo cambiato per tutti i marchi", mod.map((p) => p.prezzoBase));
  await senza(S.aggiungiVoceServizio(fd({ tipologia: "SERVIZI_TRASPORTO", nome: "Trasporto con gru", prezzo: "150" })));
  verifica((await prisma.prodotto.count({ where: { tipologia: "SERVIZI_TRASPORTO", colore: "Trasporto con gru" } })) === nBrand, "voce nuova aggiunta in tutti i marchi");
  // il seed rilanciato NON riscrive prezzi, nomi e voci
  const r2 = await seed();
  const dopo = await prisma.prodotto.findMany({ where: { tipologia: "SERVIZI_POSA" }, select: { colore: true, prezzoBase: true } });
  verifica(r2.prodottiCreati === 0 && dopo.some((p) => p.colore === "Posa a ore (2 operai)" && p.prezzoBase === 65.5) && !dopo.some((p) => p.colore === "Posa a ore (per ora)"), "rilanciando il seed restano i tuoi prezzi e nomi", r2);
  await senza(S.eliminaVoceServizio(fd({ tipologia: "SERVIZI_TRASPORTO", nomeOriginale: "Trasporto con gru" })));
  verifica((await prisma.prodotto.count({ where: { tipologia: "SERVIZI_TRASPORTO", colore: "Trasporto con gru" } })) === 0, "voce tolta");
  console.log(`\n${ok} controlli superati, ${ko} falliti`);
  process.exit(ko ? 1 : 0);
})();
