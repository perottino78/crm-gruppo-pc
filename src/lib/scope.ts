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
  // chi vede solo i suoi: i lead assegnati a lui e le «chiamate con commerciale» fissate per lui
  return { OR: [{ telefonistaId: utente.id }, { venditoreId: utente.id, fase: "APPUNTAMENTO_TELEFONICO" }] };
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
