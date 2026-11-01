// Formati e colori dei report, usabili sia dal server sia dai grafici nel browser.
// Colori categoriali in ordine fisso (skill dataviz, palette validata): blu, arancio, verde, ambra, rosa, verde scuro, viola, rosso.
export const COLORI = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

export const eur0 = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" as unknown as boolean });
export const perc1 = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${(n * 100).toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`);
