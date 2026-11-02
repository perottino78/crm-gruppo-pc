import { test } from "node:test";
import assert from "node:assert/strict";
import { leggiRimbalzo, eRimbalzo, spiegaRimbalzo } from "../../src/lib/mail/rimbalzi";

const POSTFIX = `Return-Path: <>
From: MAILER-DAEMON@mail.gruppopec.com (Mail Delivery System)
Subject: Undelivered Mail Returned to Sender
To: promozionale@gruppopec.com
Content-Type: multipart/report; report-type=delivery-status; boundary="B"

--B
Content-Type: text/plain

This is the mail system at host mail.gruppopec.com.
I'm sorry to have to inform you that your message could not be delivered to one or more recipients.

<mario.rossii@gmail.com>: host gmail-smtp-in.l.google.com said: 550-5.1.1 The email account that you tried to reach does not exist.

--B
Content-Type: message/delivery-status

Reporting-MTA: dns; mail.gruppopec.com
Final-Recipient: rfc822; mario.rossii@gmail.com
Original-Recipient: rfc822;mario.rossii@gmail.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does
    not exist. Please try double-checking the recipient's email address

--B
Content-Type: text/rfc822-headers

From: Promozionale P&C <promozionale@gruppopec.com>
To: mario.rossii@gmail.com
Subject: Mario, la tua pergola
X-CRM-Invio: c-cmabc12345xyz
--B--
`;

const PIENA = `From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
Subject: Delivery Status Notification (Failure)
Content-Type: multipart/report; report-type=delivery-status; boundary="Z"

--Z
Content-Type: message/delivery-status

Final-Recipient: rfc822; anna@libero.it
Action: failed
Status: 5.2.2
Diagnostic-Code: smtp; 552 5.2.2 Mailbox full / quota exceeded
--Z--
`;

const EXIM_ITALIANO = `From: Mail Delivery System <Mailer-Daemon@aruba.it>
Subject: Mail delivery failed: returning message to sender

Questo messaggio è stato creato automaticamente dal sistema di posta.
Non è stato possibile recapitare il messaggio ai seguenti indirizzi:

  luca@dominiosbagliato.it
    host lookup did not complete: domain not found (NXDOMAIN)

------ This is a copy of the message, including all the headers. ------
X-CRM-Invio: l-cmlead0001
Subject: GRUPPO P&C: Grazie per la tua richiesta!
`;

const NORMALE = `From: Mario Rossi <mario@rossi.it>
Subject: Re: preventivo pergola
Content-Type: text/plain

Buongiorno, la pergola mi interessa. Mario
`;

test("riconosce i rimbalzi e lascia stare le email normali", () => {
  assert.ok(eRimbalzo(POSTFIX) && eRimbalzo(PIENA) && eRimbalzo(EXIM_ITALIANO));
  assert.equal(eRimbalzo(NORMALE), false);
  assert.equal(leggiRimbalzo(NORMALE), null);
});

test("Postfix: indirizzo inesistente, codice dell'invio, permanente", () => {
  const r = leggiRimbalzo(POSTFIX, { ignora: ["promozionale@gruppopec.com"] })!;
  assert.deepEqual(r.destinatari, ["mario.rossii@gmail.com"]);
  assert.equal(r.codice, "c-cmabc12345xyz");
  assert.equal(r.permanente, true);
  assert.equal(r.motivo, "indirizzo inesistente");
});

test("casella piena: temporaneo, si riprova", () => {
  const r = leggiRimbalzo(PIENA)!;
  assert.deepEqual(r.destinatari, ["anna@libero.it"]);
  assert.equal(r.permanente, false);
  assert.equal(r.motivo, "casella del cliente piena");
});

test("rimbalzo a parole (Exim, italiano): dominio sbagliato, codice del lead", () => {
  const r = leggiRimbalzo(EXIM_ITALIANO)!;
  assert.ok(r.destinatari.includes("luca@dominiosbagliato.it"));
  assert.equal(r.codice, "l-cmlead0001");
  assert.equal(r.permanente, true);
  assert.equal(r.motivo, "dominio sbagliato o inesistente");
});

test("motivi in parole semplici", () => {
  assert.equal(spiegaRimbalzo("550 5.7.1 Message rejected as spam"), "rifiutata dal server del cliente (filtro antispam)");
  assert.equal(spiegaRimbalzo("qualcosa di strano", "554 errore generico"), "non recapitata: 554 errore generico");
});
