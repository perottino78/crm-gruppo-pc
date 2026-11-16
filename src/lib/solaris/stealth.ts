// Catalogo Stealth Energy (Suzhou Stealth Energy Technology) per Solaris Studio.
// Fonti: listino del distributore italiano TekGreen 2024 (ST-INV-S4.0/5.0/6.0, ST-INV-T10.0, SP-HEV50) e
// sito del produttore stealthenergy.cn (ST-INV-S 3 kW, trifase 5–8 kW, moduli HV/48 V, AIO).
// Prezzi di vendita e costi a 0: li inserisce Ugo. Le schede tecniche vanno in misureJson.specs.
// File puro: niente DB, usato dalla rotta dello Studio (caricamento automatico) e dai test.

export type ComponenteStealth = {
  categoria: "INVERTER" | "BATTERIA";
  nome: string;
  potenzaW: number; // W per gli inverter, Wh del modulo per le batterie
  faseTipo: "MONOFASE" | "TRIFASE";
  ibrido: boolean;
  note: string;
  misureJson: Record<string, unknown>;
};

const MONO = { vac: "220–240 V", comm: "WiFi · RS485 · APP", ip: "IP65", cert: "CEI 0-21 · IEC 62109-1/2 · VDE-AR-N 4105" };
const TRI = { vac: "380–415 V", comm: "WiFi · RS485 · APP", ip: "IP65", cert: "CEI 0-21 · IEC 62109-1/2 · VDE-AR-N 4105" };

function invMono(kw: number, fonte: string): ComponenteStealth {
  const sigla = `ST-INV-S${kw.toFixed(1)}`;
  return {
    categoria: "INVERTER",
    nome: `Stealth ${sigla} ${String(kw).replace(".", ",")} kW (ibrido)`,
    potenzaW: kw * 1000,
    faseTipo: "MONOFASE",
    ibrido: true,
    note: `Inverter ibrido monofase Stealth Energy ${sigla}. Batterie HV 80–495 V. ${fonte}`,
    misureJson: {
      sigla,
      marca: "Stealth Energy",
      specs: { eff: 97.6, mppt: 2, mppt_range: "125–530 V", vdc_max: "550 V", vbatt: "85–460 V", ...MONO, gar: 7, dim: "411 × 505 × 192 mm", peso: "18 kg", eps: "< 200 ms" },
    },
  };
}

function invTri(kw: number, extra: Record<string, unknown>, fonte: string): ComponenteStealth {
  const sigla = `ST-INV-T${kw.toFixed(1)}`;
  return {
    categoria: "INVERTER",
    nome: `Stealth ${sigla} ${kw} kW trifase (ibrido)`,
    potenzaW: kw * 1000,
    faseTipo: "TRIFASE",
    ibrido: true,
    note: `Inverter ibrido trifase Stealth Energy ${sigla}. ${fonte}`,
    misureJson: { sigla, marca: "Stealth Energy", specs: { mppt: 2, mppt_range: "200–850 V", vdc_max: "1000 V", vbatt: "180–600 V", ...TRI, gar: 7, peso: "28 kg", eps: "< 100 ms", ...extra } },
  };
}

function batteria(sigla: string, kwh: number, descr: string, specs: Record<string, unknown>): ComponenteStealth {
  return {
    categoria: "BATTERIA",
    nome: `Stealth ${sigla} ${String(kwh).replace(".", ",")} kWh`,
    potenzaW: Math.round(kwh * 1000),
    faseTipo: "MONOFASE",
    ibrido: false,
    note: `${descr} Stealth Energy ${sigla}.`,
    misureJson: { sigla, marca: "Stealth Energy", kwh, specs },
  };
}

export const CATALOGO_STEALTH: ComponenteStealth[] = [
  invMono(3, "Dati del produttore."),
  invMono(4, "Listino Italia."),
  invMono(5, "Listino Italia."),
  invMono(6, "Listino Italia."),
  invTri(5, { eff: 98.6, dim: "457 × 654 × 228 mm" }, "Dati del produttore, fino a 16 in parallelo."),
  invTri(6, { eff: 98.6, dim: "457 × 654 × 228 mm" }, "Dati del produttore."),
  invTri(8, { eff: 98.6, dim: "457 × 654 × 228 mm" }, "Dati del produttore."),
  invTri(10, { eff: 98.6, dim: "457 × 654 × 228 mm" }, "Listino Italia."),
  batteria("SP-HEV50", 5, "Modulo batteria al litio alta tensione, espandibile (controller SP-HEV27: 1 ogni 5 moduli)", {
    chimica: "LFP", cicli: "10.000", ip: "IP65", dim: "640 × 420 × 380 mm", gar: 10, compat: "ST-INV-S4.0–6.0 · ST-INV-T10.0",
  }),
  batteria("SP-HEHV27", 2.76, "Modulo batteria alta tensione 80–576 V, da 1 a 5 moduli", {
    chimica: "LFP", dod: "95%", cicli: "10.000 (garanzia 10 anni)", ip: "IP65", dim: "640 × 220 × 380 mm per modulo", peso: "30,5 kg per modulo",
    vmod: "80–115,2 V per modulo", gar: 10, compat: "inverter ibridi Stealth HV",
  }),
  batteria("SP-HE4850", 2.4, "Modulo batteria bassa tensione 48 V, espandibile fino a 14,4 kWh", {
    chimica: "LFP", dod: "90%", ip: "IP20", gar: 10, compat: "solo inverter 48 V (non ST-INV)",
  }),
  batteria("AIO 5 kW", 5.52, "Sistema tutto-in-uno inverter 5 kW + batteria, espandibile fino a 33 kWh", {
    chimica: "LFP", dod: "95%", ip: "IP65", gar: 10, compat: "sistema completo (inverter compreso)",
  }),
];

/** Quanti moduli servono per avere almeno i kWh richiesti. */
export function moduliPer(kwhRichiesti: number, kwhModulo: number): number {
  if (!(kwhRichiesti > 0) || !(kwhModulo > 0)) return 0;
  return Math.ceil(kwhRichiesti / kwhModulo - 1e-9);
}
