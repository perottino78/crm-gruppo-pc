// Eventi del servizio di invio (webhook di Brevo) → cosa fare in P&C ONE. Funzioni pure, testate in tests/mail/eventi-brevo.test.ts.
// Brevo rimanda il valore dell'intestazione X-Mailin-custom (lo stesso codice di X-CRM-Invio: c-<invio campagna> | l-<email lead>).

export type EventoBrevo = { event?: string; email?: string; "X-Mailin-custom"?: string; tag?: string; reason?: string; date?: string };
export type AzioneBrevo =
  | { tipo: "RIMBALZO"; email: string; codice: string | null; permanente: boolean; motivo: string }
  | { tipo: "DISISCRITTO"; email: string; codice: string | null; motivo: string }
  | { tipo: "NIENTE" };

const codiceDi = (x: EventoBrevo) => {
  const c = (x["X-Mailin-custom"] ?? "").trim();
  return /^[cl]-[A-Za-z0-9_-]+$/.test(c) ? c : null;
};

export function azioneBrevo(x: EventoBrevo): AzioneBrevo {
  const email = (x.email ?? "").trim().toLowerCase();
  if (!/.+@.+\..+/.test(email)) return { tipo: "NIENTE" };
  const ev = (x.event ?? "").toLowerCase().replace(/[\s-]/g, "_");
  const codice = codiceDi(x);
  const perche = x.reason ? `: ${x.reason}`.slice(0, 160) : "";
  switch (ev) {
    case "hard_bounce": case "hardbounce": return { tipo: "RIMBALZO", email, codice, permanente: true, motivo: `indirizzo inesistente o rifiutato (Brevo)${perche}` };
    case "invalid_email": case "invalid": return { tipo: "RIMBALZO", email, codice, permanente: true, motivo: "indirizzo non valido (Brevo)" };
    case "blocked": return { tipo: "RIMBALZO", email, codice, permanente: true, motivo: `indirizzo bloccato da Brevo (rimbalzi o spam in passato)${perche}` };
    case "soft_bounce": case "softbounce": case "deferred": return { tipo: "RIMBALZO", email, codice, permanente: false, motivo: `non recapitata per ora (casella piena o server non disponibile)${perche}` };
    case "unsubscribed": case "unsubscribe": return { tipo: "DISISCRITTO", email, codice, motivo: "si è disiscritto (Brevo)" };
    case "spam": case "complaint": return { tipo: "DISISCRITTO", email, codice, motivo: "ha segnalato l'email come spam (Brevo)" };
    default: return { tipo: "NIENTE" };
  }
}
