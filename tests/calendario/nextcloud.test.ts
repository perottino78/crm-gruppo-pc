import { test } from "node:test";
import assert from "node:assert/strict";
import { leggiEventi, leggiData, durataMs, leggiMultistatus, leggiCalendari, personaDelCalendario, abbinaCalendario, uidOne, chiaveDaUid, eDiOne, esterniDaMostrare, decisione } from "../../src/lib/calendario/ical";

const ICS = [
  "BEGIN:VCALENDAR", "VERSION:2.0",
  "BEGIN:VEVENT", "UID:abc-1", "DTSTART;TZID=Europe/Rome:20261112T093000", "DTEND;TZID=Europe/Rome:20261112T113000", "SUMMARY:Roberto Marongiu - 2° APP\\, Rossi", "LOCATION:Via Roma 1\\, Torino",
  "DESCRIPTION:riga uno\\nriga due molto lunga che con", " tinua qui", "BEGIN:VALARM", "DESCRIPTION:non questa", "TRIGGER:-PT15M", "END:VALARM", "END:VEVENT",
  "BEGIN:VEVENT", "UID:abc-2", "DTSTART;VALUE=DATE:20261113", "DTEND;VALUE=DATE:20261114", "SUMMARY:Smart Working", "STATUS:CANCELLED", "END:VEVENT",
  "BEGIN:VEVENT", "UID:abc-3", "DTSTART:20261114T080000Z", "DURATION:PT45M", "SUMMARY:Fiera", "RECURRENCE-ID:20261114T080000Z", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("leggiEventi: ora di Roma, giorno intero, durata, testo con virgole e righe continuate, allarme ignorato", () => {
  const [a, b, c] = leggiEventi(ICS);
  assert.equal(a.uid, "abc-1");
  assert.equal(a.inizio.toISOString(), "2026-11-12T08:30:00.000Z");
  assert.equal(a.fine.toISOString(), "2026-11-12T10:30:00.000Z");
  assert.equal(a.titolo, "Roberto Marongiu - 2° APP, Rossi");
  assert.equal(a.luogo, "Via Roma 1, Torino");
  assert.equal(a.note, "riga uno\nriga due molto lunga che continua qui");
  assert.ok(b.giornataIntera && b.annullato && b.inizio.toISOString() === "2026-11-12T23:00:00.000Z");
  assert.equal(c.fine.getTime() - c.inizio.getTime(), 45 * 60_000);
  assert.equal(c.ricorrenza, "20261114T080000Z");
});

test("date e durate", () => {
  assert.equal(leggiData("", "20260701T100000")!.d.toISOString(), "2026-07-01T08:00:00.000Z", "ora legale");
  assert.equal(durataMs("P1DT2H"), 26 * 3_600_000);
  assert.equal(leggiData("", "boh"), null);
});

test("multistatus e calendari di Nextcloud", () => {
  const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav" xmlns:x1="http://apple.com/ns/ical/">
  <d:response><d:href>/remote.php/dav/calendars/ugo/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
  <d:response><d:href>/remote.php/dav/calendars/ugo/marco-piccatti-bconsole/</d:href><d:propstat><d:prop><d:displayname>Marco Piccatti BCONSOLE</d:displayname><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set><x1:calendar-color>#0082c9</x1:calendar-color></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
  <d:response><d:href>/remote.php/dav/calendars/ugo/attivita/</d:href><d:propstat><d:prop><d:displayname>Attività</d:displayname><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><cal:supported-calendar-component-set><cal:comp name="VTODO"/></cal:supported-calendar-component-set></d:prop></d:propstat></d:response>
  <d:response><d:href>/remote.php/dav/calendars/ugo/x/a.ics</d:href><d:propstat><d:prop><d:getetag>&quot;e1&quot;</d:getetag><cal:calendar-data>BEGIN:VCALENDAR&#13;
END:VCALENDAR</cal:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;
  const cal = leggiCalendari(xml);
  assert.deepEqual(cal, [{ href: "/remote.php/dav/calendars/ugo/marco-piccatti-bconsole/", nome: "Marco Piccatti BCONSOLE", colore: "#0082c9" }], "solo i calendari di eventi (non le attività)");
  const m = leggiMultistatus(xml).find((x) => x.href.endsWith("a.ics"))!;
  assert.equal(m.etag, '"e1"');
  assert.match(m.dati!, /BEGIN:VCALENDAR\r\nEND:VCALENDAR/);
});

test("abbinamento calendario → persona", () => {
  const utenti = [{ id: "m", nome: "Marco Piccatti" }, { id: "p", nome: "Gian Paolo Visconti" }, { id: "g", nome: "massimo giordano" }];
  assert.equal(personaDelCalendario("Massimo+Porcu+BCONSOLE"), "Massimo Porcu");
  assert.equal(abbinaCalendario("Marco Piccatti BCONSOLE", utenti), "m");
  assert.equal(abbinaCalendario("Paolo Visconti BCONSOLE", utenti), "p");
  assert.equal(abbinaCalendario("massimo giordano BCONSOLE", utenti), "g", "maiuscole e minuscole");
  assert.equal(abbinaCalendario("Azienda BCONSOLE", utenti), null);
});

test("uid di P&C ONE e chiavi", () => {
  const u = uidOne("APPUNTAMENTO:ck123");
  assert.equal(u, "one-appuntamento-ck123@crm-gruppo-pc");
  assert.ok(eDiOne(u) && !eDiOne("abc-1"));
  assert.equal(chiaveDaUid(u), "APPUNTAMENTO:ck123");
  assert.equal(chiaveDaUid(uidOne("RIUNIONE:r1:u2")), "RIUNIONE:r1-u2");
});

test("esterni che doppiano un impegno di P&C ONE non si mostrano", () => {
  const t = (h: number) => new Date(Date.UTC(2026, 10, 12, h));
  const est = [{ utenteId: "m", inizio: t(9) }, { utenteId: "m", inizio: t(15) }, { utenteId: "x", inizio: t(9) }];
  assert.equal(esterniDaMostrare(est, [{ utenteId: "m", inizio: new Date(t(9).getTime() + 20 * 60_000) }]).length, 2);
});

test("decisione della sincronizzazione", () => {
  const base = { impronta: "a", improntaSalvata: "a" };
  assert.equal(decisione({ ...base, etagSalvato: null, etagNextcloud: null, esisteSuNextcloud: false }), "CREA");
  assert.equal(decisione({ ...base, etagSalvato: "1", etagNextcloud: "1", esisteSuNextcloud: true }), "NIENTE");
  assert.equal(decisione({ ...base, improntaSalvata: "b", etagSalvato: "1", etagNextcloud: "1", esisteSuNextcloud: true }), "AGGIORNA_NEXTCLOUD");
  assert.equal(decisione({ ...base, etagSalvato: "1", etagNextcloud: "2", esisteSuNextcloud: true }), "PRENDI_DA_NEXTCLOUD");
  assert.equal(decisione({ ...base, etagSalvato: "1", etagNextcloud: null, esisteSuNextcloud: false }), "CANCELLATO_SU_NEXTCLOUD");
});
