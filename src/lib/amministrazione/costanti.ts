// Costanti condivise del modulo Amministrazione (usabili anche lato client)
export const CATEGORIE_MOVIMENTO = [
  "Commissioni e spese bancarie",
  "Stipendi e collaboratori",
  "F24 / imposte e contributi",
  "Fornitori (senza scadenza)",
  "Utenze e telefonia",
  "Carburante e auto",
  "Affitti",
  "Finanziamenti e leasing",
  "Ritenute su bonifici con detrazione",
  "Incassi da cessione crediti",
  "Costi e commissioni per cessioni",
  "Giroconto fra conti",
  "Prelievo / versamento contanti",
  "Altro incasso",
  "Altra spesa",
];

export const STATI_SCADENZA: Record<string, { label: string; cls: string }> = {
  APERTA: { label: "Aperta", cls: "bg-sky-100 text-sky-800 border-sky-300" },
  SCADUTA: { label: "Scaduta", cls: "bg-red-600 text-white border-red-700" },
  PARZIALE: { label: "Parziale", cls: "bg-amber-100 text-amber-900 border-amber-300" },
  PAGATA: { label: "Saldata", cls: "bg-green-600 text-white border-green-700" },
  ANNULLATA: { label: "Annullata", cls: "bg-neutral-200 text-neutral-600 border-neutral-300" },
};

export const STATI_MOVIMENTO: Record<string, { label: string; cls: string }> = {
  DA_ABBINARE: { label: "Da abbinare", cls: "bg-amber-100 text-amber-900 border-amber-300" },
  ABBINATO: { label: "Abbinato", cls: "bg-green-100 text-green-800 border-green-300" },
  REGISTRATO: { label: "Registrato", cls: "bg-neutral-100 text-neutral-700 border-neutral-300" },
};

// Giorni dopo la creazione della commessa entro cui è atteso l'acconto
export const GIORNI_ATTESA_ACCONTO = 7;

// useGrouping "always": in italiano il punto delle migliaia altrimenti manca sui numeri di 4 cifre (3286,08 → 3.286,08)
export const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" as unknown as boolean });
export const dataIt = (d: Date | null | undefined) => (d ? d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
