export type BrandInfo = {
  nome: string;
  primary: string;
  primarySoft: string;
  accent: string;
};

// Schema colori per brand (richiesto da Ugo):
// P&C = arancione + nero, Purafonte = blu, Solaris = verde + giallo (fotovoltaico/eco),
// Work & Services = teal/slate (nessuna indicazione precisa ricevuta, colore neutro distinto)
export const BRANDS: BrandInfo[] = [
  { nome: "P&C", primary: "#EA580C", primarySoft: "#FFF3EB", accent: "#171717" },
  { nome: "Solaris", primary: "#16A34A", primarySoft: "#EEFBF2", accent: "#EAB308" },
  { nome: "Purafonte", primary: "#2563EB", primarySoft: "#EFF4FF", accent: "#0EA5E9" },
  { nome: "Work & Services", primary: "#0D9488", primarySoft: "#EDFAF8", accent: "#334155" },
];

export function brandInfo(nome?: string | null): BrandInfo {
  return BRANDS.find((b) => b.nome === nome) ?? { nome: "Tutti", primary: "#525252", primarySoft: "#F5F5F5", accent: "#171717" };
}
