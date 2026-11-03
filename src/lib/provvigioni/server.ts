// Dati dell'area commerciale (lato server): contratti del CRM e di BConsole, pagamenti del cliente, provvigioni.
import { prisma } from "@/lib/prisma";
import { residuoScadenza } from "@/lib/amministrazione/server";
import { SIGLE_COMMERCIALI, NOMI_COMMERCIALI } from "@/lib/clienti/bconsole";
import { puo, visibilitaDi, type ConPermessi } from "@/lib/permessi/catalogo";
import { cent, contrattiDaFatture, incassatoScadenza, sigleDi, type Contratto, type Pagamento, type ProgettoC } from "./calcoli";

type Persona = { id: string; nome: string; username: string | null };

const numeroCommessa = (c: { anno: number; numero: number }) => `C${c.anno}-${String(c.numero).padStart(3, "0")}`;

/** Fatturazione/amministrazione: controlla i contratti, inserisce e liquida le provvigioni. */
export const gestisceProvvigioni = (u: ConPermessi | null | undefined) => puo(u, "provvigioni") || puo(u, "amministrazione");

/** Di chi può vedere i contratti: i suoi; il responsabile di zona anche quelli dei venditori della zona; fatturazione e amministratore tutti. */
export async function personeVisibili(u: ConPermessi & { id: string; visibileUtenti?: string[] | null }): Promise<Persona[]> {
  // le provvigioni sono riservate: "vede tutto" sui clienti (es. marketing) non basta, servono fatturazione o amministrazione
  const tutti = gestisceProvvigioni(u);
  const ids = tutti ? undefined : [u.id, ...(visibilitaDi(u) === "ZONA" ? u.visibileUtenti ?? [] : [])];
  return prisma.utente.findMany({
    where: ids ? { id: { in: ids } } : { OR: [{ preventivi: { some: {} } }, { provvigioni: { some: {} } }, { username: { in: Object.values(SIGLE_COMMERCIALI) } }] },
    select: { id: true, nome: true, username: true },
    orderBy: { nome: "asc" },
  });
}

/** Tutti i contratti di queste persone, con i pagamenti del cliente e la provvigione. */
export async function contrattiDi(persone: Persona[]): Promise<Contratto[]> {
  if (!persone.length) return [];
  const ids = persone.map((p) => p.id);
  const nomeDi = new Map(persone.map((p) => [p.id, p.nome]));
  const sigla = new Map<string, Persona>();
  for (const p of persone) for (const s of sigleDi(p, SIGLE_COMMERCIALI, NOMI_COMMERCIALI)) sigla.set(s, p);

  const [commesse, fattureBC, provvigioni] = await Promise.all([
    prisma.commessa.findMany({
      where: { preventivo: { commercialeId: { in: ids } } },
      include: { cliente: { select: { nome: true, comune: true } }, brand: { select: { nome: true } }, preventivo: { select: { commercialeId: true, oggetto: true } } },
      orderBy: { createdAt: "desc" },
    }),
    sigla.size
      ? prisma.fatturaVendita.findMany({
          where: { venditore: { in: [...sigla.keys()], mode: "insensitive" }, commessaId: null },
          select: { id: true, numero: true, data: true, clienteNome: true, imponibile: true, totale: true, tipoDocumento: true, venditore: true, progetto: true, brand: true, descrizione: true, commessaId: true },
        })
      : Promise.resolve([]),
    prisma.provvigione.findMany({ where: { utenteId: { in: ids } }, include: { liquidazioni: { orderBy: { data: "asc" } } } }),
  ]);
  const idCommesse = commesse.map((c) => c.id);
  const fattureCommesse = idCommesse.length
    ? await prisma.fatturaVendita.findMany({ where: { commessaId: { in: idCommesse } }, select: { id: true, numero: true, commessaId: true } })
    : [];
  const numeriProgetto = [...new Set(fattureBC.map((f) => f.progetto?.trim()).filter((x): x is string => !!x))];
  const progetti = new Map<string, ProgettoC>(
    (numeriProgetto.length ? await prisma.progettoBC.findMany({ where: { numero: { in: numeriProgetto } } }) : []).map((p) => [p.numero, p]),
  );
  const bc = contrattiDaFatture(fattureBC, progetti);

  // scadenze di incasso: quelle delle commesse e quelle delle fatture (BConsole o agganciate alle commesse)
  const idFatture = [...bc.flatMap((c) => c.idFatture), ...fattureCommesse.map((f) => f.id)];
  const scadenze = idCommesse.length || idFatture.length
    ? await prisma.scadenza.findMany({
        where: { tipo: "INCASSO", OR: [...(idCommesse.length ? [{ commessaId: { in: idCommesse } }] : []), ...(idFatture.length ? [{ fatturaVenditaId: { in: idFatture } }] : [])] },
        include: { abbinamenti: { select: { importo: true, movimento: { select: { data: true } } } } },
        orderBy: [{ dataScadenza: "asc" }, { createdAt: "asc" }],
      })
    : [];
  const contrattoDiFattura = new Map<string, string>();
  for (const c of bc) for (const f of c.idFatture) contrattoDiFattura.set(f, c.chiave);
  for (const f of fattureCommesse) contrattoDiFattura.set(f.id, `C:${f.commessaId}`);
  const pagamentiDi = new Map<string, Pagamento[]>();
  const viste = new Set<string>();
  for (const s of scadenze) {
    if (viste.has(s.id)) continue;
    viste.add(s.id);
    const chiave = s.commessaId ? `C:${s.commessaId}` : s.fatturaVenditaId ? contrattoDiFattura.get(s.fatturaVenditaId) : undefined;
    if (!chiave) continue;
    const residuo = residuoScadenza(s);
    const date = s.abbinamenti.map((a) => a.movimento.data).sort((a, b) => b.getTime() - a.getTime());
    pagamentiDi.set(chiave, [...(pagamentiDi.get(chiave) ?? []), {
      id: s.id, descrizione: s.descrizione, importo: s.importo, residuo: Math.max(0, residuo),
      incassato: incassatoScadenza({ importo: s.importo, residuo, stato: s.stato }), scadenza: s.dataScadenza,
      ultimoIncasso: date[0] ?? (s.stato === "PAGATA" ? s.updatedAt : null), stato: s.stato, documento: s.numeroDocumento,
    }]);
  }
  const provDi = new Map(provvigioni.map((p) => [`${p.contratto}|${p.utenteId}`, p]));
  const conProvvigione = (chiave: string, utenteId: string | null) => {
    const p = utenteId ? provDi.get(`${chiave}|${utenteId}`) : undefined;
    return p ? { id: p.id, base: p.base, percentuale: p.percentuale, importo: p.importo, note: p.note, controllataDa: p.controllataDa, controllataIl: p.controllataIl, liquidazioni: p.liquidazioni } : null;
  };

  const daCommesse: Contratto[] = commesse.map((c) => {
    const chiave = `C:${c.id}`;
    let pagamenti = pagamentiDi.get(chiave) ?? [];
    // commessa senza scadenze nello scadenzario: acconto e saldo come segnati nella commessa
    if (!pagamenti.length && c.totaleVendita > 0) {
      const acconto = c.accontoTipo !== "FINANZIAMENTO" && c.accontoImporto > 0 ? c.accontoImportoIncassato ?? c.accontoImporto : 0;
      const voci = [
        acconto > 0 && { id: `${c.id}-a`, descrizione: "Acconto", importo: acconto, pagato: c.accontoIncassato ? acconto : 0, il: c.accontoIncassatoIl },
        { id: `${c.id}-s`, descrizione: c.accontoTipo === "FINANZIAMENTO" ? "Importo da finanziamento" : "Saldo", importo: cent(c.totaleVendita - acconto), pagato: c.saldoIncassato ? cent(c.saldoImporto ?? c.totaleVendita - acconto) : 0, il: c.saldoIncassatoIl },
      ].filter(Boolean) as { id: string; descrizione: string; importo: number; pagato: number; il: Date | null }[];
      pagamenti = voci.map((v) => ({ id: v.id, descrizione: v.descrizione, importo: v.importo, incassato: Math.min(v.importo, v.pagato), residuo: cent(Math.max(0, v.importo - v.pagato)), scadenza: null, ultimoIncasso: v.pagato ? v.il : null, stato: v.pagato >= v.importo - 0.005 ? "PAGATA" : v.pagato ? "PARZIALE" : "APERTA" }));
    }
    const commercialeId = c.preventivo.commercialeId;
    return {
      chiave, origine: "CRM", numero: numeroCommessa(c), data: c.createdAt, clienteNome: c.cliente.nome, comune: c.cliente.comune,
      marchio: c.brand.nome, descrizione: c.preventivo.oggetto, stato: c.stato, commercialeId, commercialeNome: nomeDi.get(commercialeId) ?? "",
      imponibile: c.totaleImponibile || c.totaleVendita, dovuto: c.totaleVendita,
      fatture: fattureCommesse.filter((f) => f.commessaId === c.id).map((f) => f.numero),
      href: `/commesse/${c.id}`, pagamenti, provvigione: conProvvigione(chiave, commercialeId),
    };
  });
  const daBC: Contratto[] = bc.map(({ idFatture: _f, venditore, ...c }) => {
    const p = venditore ? sigla.get(venditore.toUpperCase()) : undefined;
    return { ...c, commercialeId: p?.id ?? null, commercialeNome: p?.nome ?? venditore ?? "", href: null, pagamenti: pagamentiDi.get(c.chiave) ?? [], provvigione: conProvvigione(c.chiave, p?.id ?? null) };
  });
  return [...daCommesse, ...daBC].sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0));
}
