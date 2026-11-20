// Schede di produzione HTML per il fornitore: modello → compilazione con le misure definitive → documento della pratica da allegare all'ordine.
import { prisma } from "../../src/lib/prisma";
import * as A from "../../src/app/schede-produzione-actions";
import { assicuraModelliPronti } from "../../src/lib/ordini/schede-server";
import { MODELLO_PREDEFINITO, MODELLO_SEEGLASS } from "../../src/lib/ordini/scheda-produzione";
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
  // modulo con scelte a spunta (SEEGLASS RUN): una scelta singola e una multipla (più valori con lo stesso nome)
  await redir(A.salvaModelloScheda(fd({ nome: "Seeglass", html: MODELLO_SEEGLASS })));
  const ms = await prisma.schedaProduzioneModello.findFirstOrThrow({ where: { nome: "Seeglass" } });
  const f2 = fd({ ordineId: ord.id, modelloId: ms.id, campo_n_vie: "4 vie", campo_larghezza_mm: "4200" });
  f2.append("campo_chiusura", "Serratura CD-4"); f2.append("campo_chiusura", "Maniglia e azionamento");
  await redir(A.creaSchedaProduzione(f2));
  const d2 = (await prisma.documento.findMany({ where: { entita: "COMMESSA", entitaId: com.id, nome: { contains: "Scheda produzione" } }, orderBy: { createdAt: "desc" } }))[0];
  const h2 = d2.contenuto.toString("utf-8");
  verifica(h2.includes("&#9746; 4 vie") && h2.includes("&#9744; 3 vie"), "scelta singola con le caselle ☒ ☐");
  verifica(h2.includes("&#9746; Serratura CD-4") && h2.includes("&#9746; Maniglia e azionamento") && h2.includes("&#9744; Auto-blocco"), "scelta multipla: più voci spuntate");
  await redir(A.eliminaModelloScheda(fd({ id: m.id })));
  verifica((await prisma.schedaProduzioneModello.count()) === 1 && (await prisma.documento.count()) === 2, "eliminando il modello restano le schede già create");
  // moduli pronti creati da soli una volta (richiesta di Ugo 20/11/2026)
  await prisma.$executeRawUnsafe('TRUNCATE "SchedaProduzioneModello" CASCADE');
  await prisma.configurazione.deleteMany({ where: { chiave: "schede_pronte_versione" } });
  const creati = await assicuraModelliPronti();
  const nomi = (await prisma.schedaProduzioneModello.findMany({ select: { nome: true } })).map((x) => x.nome);
  verifica(creati === 4 && nomi.some((n) => n.includes("legno piallato")) && nomi.some((n) => n.includes("NEW LIPARI")) && nomi.some((n) => n.includes("SEEGLASS")), "i moduli pronti (standard, NEW LIPARI, SEEGLASS, legno piallato) compaiono da soli", nomi);
  await prisma.schedaProduzioneModello.deleteMany({ where: { nome: { contains: "SEEGLASS" } } });
  verifica((await assicuraModelliPronti()) === 0 && (await prisma.schedaProduzioneModello.count()) === 3, "una volta sola: un modello tolto a mano non torna");
  // produzione già alla versione 1 (senza legno): al rilascio arriva solo il modulo nuovo, il SEEGLASS tolto non torna
  await prisma.schedaProduzioneModello.deleteMany({ where: { nome: { contains: "legno piallato" } } });
  await prisma.configurazione.update({ where: { chiave: "schede_pronte_versione" }, data: { valore: "1" } });
  const agg = await assicuraModelliPronti();
  const dopo = (await prisma.schedaProduzioneModello.findMany({ select: { nome: true } })).map((x) => x.nome);
  verifica(agg === 1 && dopo.some((n) => n.includes("legno piallato")) && !dopo.some((n) => n.includes("SEEGLASS")), "aggiornamento: arriva solo il modulo del legno", dopo);
  console.log(`\n${ok} controlli superati, ${ko} falliti`);
  process.exit(ko ? 1 : 0);
})();
