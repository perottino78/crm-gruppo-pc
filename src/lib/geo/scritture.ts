// I modi in cui una provincia può essere scritta nell'anagrafica (sigla e nome): modulo piccolo, sicuro anche per il browser.
import { PROVINCE } from "./province";

export function scritturePerRicerca(sigle: string[]): string[] {
  const out = new Set<string>();
  for (const s of sigle) {
    const p = PROVINCE.find((x) => x.sigla === s.toUpperCase());
    if (!p) continue;
    out.add(p.sigla);
    for (const parte of p.nome.split("/")) out.add(parte);
  }
  return [...out];
}
