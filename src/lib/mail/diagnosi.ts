// Perché la casella non si collega e cosa provare: certificato intestato a un altro nome (hosting condiviso),
// porta con l'altro tipo di cifratura (465 = SSL, 587 = STARTTLS), certificato non riconosciuto.
// Funzioni pure, testate in tests/mail/diagnosi.test.ts.
import type { Casella } from "./caselle";

export type Problema =
  | { tipo: "NOME_CERTIFICATO"; nomi: string[] } // il certificato è di un altro nome: si riprova con quello
  | { tipo: "CERTIFICATO" } // autofirmato, scaduto o incompleto: si collega solo se l'utente lo accetta
  | { tipo: "MODO" } // porta SSL usata come STARTTLS o viceversa
  | { tipo: "PASSWORD" }
  | { tipo: "RETE" }
  | { tipo: "ALTRO" };

export function capisciErrore(msg: string): Problema {
  const m = msg.toLowerCase();
  if (/altnames|does not match certificate|hostname\/ip/.test(m)) {
    const nomi = [...msg.matchAll(/DNS:([A-Za-z0-9*._-]+)/g)].map((x) => x[1].replace(/\.$/, "")).filter((n) => !n.includes("*"));
    return { tipo: "NOME_CERTIFICATO", nomi: [...new Set(nomi)] };
  }
  if (/self[- ]signed|unable to verify|unable to get local issuer|certificate has expired|cert_has_expired|certificate is not yet valid|unknown ca|depth_zero/.test(m)) return { tipo: "CERTIFICATO" };
  if (/wrong version number|ssl3_get_record|packet length too long|unknown protocol|greeting never received|unexpected socket close|tls_validate_record_header|record layer failure/.test(m)) return { tipo: "MODO" };
  if (/auth|535|534|credentials|password|login/.test(m)) return { tipo: "PASSWORD" };
  if (/enotfound|getaddrinfo|econnrefused|timeout|timed out|econnreset|ehostunreach/.test(m)) return { tipo: "RETE" };
  return { tipo: "ALTRO" };
}

/** SSL diretto (465) o STARTTLS (587 e altre): se non è indicato, si deduce dalla porta. */
export const usaSsl = (c: Pick<Casella, "porta" | "sicura">) => c.sicura ?? c.porta === 465;

const chiave = (c: Casella) => `${c.host}|${c.porta}|${usaSsl(c)}|${!!c.accettaCertificato}`;

/** Prossime impostazioni da provare dopo un errore (senza ripetere quelle già provate). */
export function alternative(c: Casella, p: Problema, provate: Set<string>, accettaCertificato: boolean): Casella[] {
  const out: Casella[] = [];
  if (p.tipo === "NOME_CERTIFICATO") for (const n of p.nomi) out.push({ ...c, host: n });
  if (p.tipo === "MODO") {
    out.push({ ...c, sicura: !usaSsl(c) }); // stessa porta, l'altra cifratura
    if (c.porta !== 465) out.push({ ...c, porta: 465, sicura: true });
    if (c.porta !== 587) out.push({ ...c, porta: 587, sicura: false });
  }
  if ((p.tipo === "CERTIFICATO" || p.tipo === "NOME_CERTIFICATO") && accettaCertificato) out.push({ ...c, accettaCertificato: true });
  return out.filter((x) => !provate.has(chiave(x)));
}
export { chiave as chiaveTentativo };

/** Cosa scrivere all'utente quando non c'è niente da fare in automatico. */
export function consiglio(p: Problema, accettaCertificato: boolean): string {
  switch (p.tipo) {
    case "PASSWORD": return "email o password della casella non corrette";
    case "RETE": return "il server di posta non risponde: controlla il nome del server (es. mail.gruppopec.com) e la porta";
    case "NOME_CERTIFICATO":
    case "CERTIFICATO": return accettaCertificato
      ? "il server ha un certificato di sicurezza non valido e non accetta la connessione nemmeno così: chiedi al fornitore dell'hosting il nome esatto del server SMTP"
      : "il server della posta ha un certificato di sicurezza non riconosciuto: spunta \"collega comunque\" e riprova (la posta resta cifrata), oppure chiedi al fornitore dell'hosting il nome esatto del server SMTP";
    case "MODO": return "la porta non corrisponde al tipo di connessione: prova 465 (SSL) o 587 (STARTTLS)";
    default: return "connessione non riuscita";
  }
}
