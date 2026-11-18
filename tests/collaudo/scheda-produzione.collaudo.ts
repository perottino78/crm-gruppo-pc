// Schede di produzione HTML per il fornitore: modello → compilazione con le misure definitive → documento della pratica da allegare all'ordine.
import { prisma } from "../../src/lib/prisma";
import * as A from "../../src/app/schede-produzione-actions";
import { MODELLO_PREDEFINITO } from "../../src/lib/ordini/scheda-produzione";
let ok = 0, ko = 0;
const verifica = (c: unknown, m: string, x?: unknown) => { if (c) { ok++; console.log("  ✓", m); } else { ko++; console.log("  ✗", m, x ?? ""); } };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const redir = async (p: Promise<unknown>) => { try { await p; return ""; } catch (e) { return String((e as { digest?: string }).digest ?? e); } };
(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "SchedaProduzioneModello","Documento","RigaOrdine","OrdineFornitore","Rilievo","Commessa","Preventivo","Cliente","Soggetto" CASCADE');
  const u = await prisma.utente.findFirst({ where: { ruolo: "AMMINISTRATORE" } }) ?? await prisma.utente.create({ data: { nome: "Admin", email: "a@a.it", username: "admin", passwordHash: "x", ruolo: "AMMINISTRATORE" } as never });
  (globalThis as { __utente?: unknown }).__utente = u;
  const brand = await prisma.brand.findFirst() ?? await prisma.brand.create({ data: { nome: "P&C", slug: "pc" } as never });
  const forn = await prisma.soggetto.create({ data: { ragioneSociale: "Serramenti Srl", ruoli: ["FORNITORE"] } });
  const cli = await prisma.cliente.create({ data: { nome: "Mario Rossi", brandId: brand.id, responsabileId: u.id } as never });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: u.id } as never });
  const com = await prisma.commessa.create({ data: { numero: 1, anno: 2026, clienteId: cli.id, brandId: brand.id, preventivoId: prev.id, responsabileId: u.id } as never });
  await prisma.rilievo.create({ data: { commessaId: com.id, tecnicoId: u.id, dataOra: new Date(), misure: "Soggiorno L 1200 × H 1400" } });
  const ord = await prisma.ordineFornitore.create({ data: { numero: 7, anno: 2026, fornitoreId: forn.id, commessaId: com.id } as never });
  await prisma.rigaOrdine.create({ data: { ordineFornitoreId: ord.id, descrizione: "Finestra 2 ante", quantita: 2, um: "pz" } as never });

  const r0 = await redir(A.salvaModelloScheda(fd({ nome: "Scheda serramenti", html: MODELLO_PREDEFINITO, fornitoreId: forn.id })));
  const m = await prisma.schedaProduzioneModello.findFirstOrThrow();
  verifica(m.nome === "Scheda serramenti" && m.fornitoreId === forn.id, "modello salvato per il fornitore", r0);
  await redir(A.creaSchedaProduzione(fd({ ordineId: ord.id, modelloId: m.id, campo_misure_definitive: "Soggiorno L 1198 × H 1395 <speciale>", campo_note_produzione: "Bianco RAL 9010" })));
  const d = await prisma.documento.findFirstOrThrow({ where: { entita: "COMMESSA", entitaId: com.id, cartella: "Schede produzione" } });
  const html = d.contenuto.toString("utf-8");
  verifica(d.mime === "text/html" && /7\/2026/.test(html) && html.includes("Serramenti Srl") && html.includes("Mario Rossi"), "scheda salvata tra i documenti della pratica con i dati dell'ordine", html.slice(0, 200));
  verifica(html.includes("Finestra 2 ante") && !html.includes("€"), "tabella del materiale senza prezzi");
  verifica(html.includes("L 1198 × H 1395 &lt;speciale&gt;") && html.includes("Bianco RAL 9010"), "misure definitive e note, protette dall'HTML");
  verifica(html.includes("Soggiorno L 1200 × H 1400"), "misure del rilievo come riferimento");
  verifica(!/\{\{/.test(html), "nessun segnaposto rimasto");
  await redir(A.eliminaModelloScheda(fd({ id: m.id })));
  verifica((await prisma.schedaProduzioneModello.count()) === 0 && (await prisma.documento.count()) === 1, "eliminando il modello restano le schede già create");
  console.log(`\n${ok} controlli superati, ${ko} falliti`);
  process.exit(ko ? 1 : 0);
})();
