// Filtri Prisma per la visibilità dei dati in base al profilo dell'utente loggato (Impostazioni › Ruoli e permessi):
// - TUTTO (amministratore, marketing, chi ha il profilo "Tutto"): nessun filtro;
// - LA SUA ZONA (responsabile commerciale di zona): i suoi, quelli delle province della zona e dei venditori della zona;
// - SOLO I SUOI: i clienti, lead, preventivi di cui è responsabile diretto o a cui è collegato
//   tramite preventivo/appuntamento/task/lead di origine.
import type { Prisma, Utente } from "@prisma/client";
import { visibilitaDi } from "@/lib/permessi/catalogo";
import { varianti } from "@/lib/zone/regioni";

type U = Pick<Utente, "id" | "ruolo"> & Partial<Pick<Utente, "ufficio" | "profiloId" | "permessi" | "visibilita" | "visibileProvince" | "visibileUtenti">>;

const team = (u: U) => [u.id, ...(u.visibileUtenti ?? []).filter((x) => x !== u.id)];

function clientiPropri(u: U, ids: string[]): Prisma.ClienteWhereInput[] {
  return [
    { responsabileId: { in: ids } },
    { preventivi: { some: { commercialeId: { in: ids } } } },
    { appuntamenti: { some: { utenteId: { in: ids } } } },
    { attivita: { some: { utenteId: u.id } } },
    { leadOrigine: { telefonistaId: u.id } },
  ];
}

export function scopeClienteWhere(utente: U): Prisma.ClienteWhereInput {
  const v = visibilitaDi(utente);
  if (v === "TUTTI") return {};
  if (v === "ZONA") {
    const prov = utente.visibileProvince ?? [];
    return { OR: [...clientiPropri(utente, team(utente)), ...(prov.length ? [{ provincia: { in: varianti(prov) } }] : [])] };
  }
  return { OR: clientiPropri(utente, [utente.id]) };
}

export function scopeLeadWhere(utente: U): Prisma.LeadWhereInput {
  const v = visibilitaDi(utente);
  if (v === "TUTTI") return {};
  if (v === "ZONA") return { OR: [{ telefonistaId: { in: team(utente) } }, { venditoreId: { in: team(utente) } }] };
  // chi vede solo i suoi: i lead assegnati a lui (come telefonista) e quelli di cui è il venditore, con tutta la trafila
  // (richiesta di Ugo 16/11/2026: il commerciale vede i lead dei suoi appuntamenti, non quelli degli altri)
  return { OR: [{ telefonistaId: utente.id }, { venditoreId: utente.id }] };
}

/** Le persone di cui l'utente vede gli impegni: null = tutti; altrimenti sé stesso (o il team della zona). */
export function utentiVisibili(utente: U): string[] | null {
  const v = visibilitaDi(utente);
  if (v === "TUTTI") return null;
  return v === "ZONA" ? team(utente) : [utente.id];
}

/**
 * «Task di oggi» di chi vede solo i suoi: i lead della telefonista restano compiti della telefonista; al venditore arrivano solo
 * le «chiamate con commerciale» fissate per lui (gli altri suoi lead li vede in «Tutti», con la trafila).
 */
export function taskLeadWhere(utente: U): Prisma.LeadWhereInput {
  if (visibilitaDi(utente) !== "PROPRI") return {};
  return { OR: [{ telefonistaId: utente.id, NOT: { fase: "APPUNTAMENTO_TELEFONICO", venditoreId: { not: utente.id } } }, { venditoreId: utente.id, fase: "APPUNTAMENTO_TELEFONICO" }] };
}

export function scopePreventivoWhere(utente: U): Prisma.PreventivoWhereInput {
  const v = visibilitaDi(utente);
  if (v === "TUTTI") return {};
  if (v === "ZONA") {
    const prov = utente.visibileProvince ?? [];
    return { OR: [{ commercialeId: { in: team(utente) } }, ...(prov.length ? [{ cliente: { provincia: { in: varianti(prov) } } }] : [])] };
  }
  return { commercialeId: utente.id };
}
