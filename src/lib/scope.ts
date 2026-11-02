// Filtri Prisma per la visibilità dei dati in base a ruolo/utente loggato:
// AMMINISTRATORE vede tutto; ogni altro ruolo vede solo i propri clienti,
// lead, preventivi e task — cioè quelli di cui è responsabile diretto, o a cui
// risulta collegato tramite preventivo/appuntamento/task/lead di origine.
import type { Prisma, Utente } from "@prisma/client";

export function scopeClienteWhere(utente: Pick<Utente, "id" | "ruolo">): Prisma.ClienteWhereInput {
  // il marketing lavora su tutta l'anagrafica (filtri, campagne, pubblici per le inserzioni)
  if (utente.ruolo === "AMMINISTRATORE" || utente.ruolo === "MARKETING") return {};
  return {
    OR: [
      { responsabileId: utente.id },
      { preventivi: { some: { commercialeId: utente.id } } },
      { appuntamenti: { some: { utenteId: utente.id } } },
      { attivita: { some: { utenteId: utente.id } } },
      { leadOrigine: { telefonistaId: utente.id } },
    ],
  };
}

export function scopeLeadWhere(utente: Pick<Utente, "id" | "ruolo">): Prisma.LeadWhereInput {
  if (utente.ruolo === "AMMINISTRATORE" || utente.ruolo === "MARKETING") return {};
  return { telefonistaId: utente.id };
}

export function scopePreventivoWhere(utente: Pick<Utente, "id" | "ruolo">): Prisma.PreventivoWhereInput {
  if (utente.ruolo === "AMMINISTRATORE") return {};
  return { commercialeId: utente.id };
}

