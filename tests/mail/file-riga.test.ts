import { test } from "node:test";
import assert from "node:assert/strict";
import { codiceFileRiga, leggiCodiceFileRiga, leggiCodiceOfferta } from "../../src/lib/mail/link-offerta";

test("link dei file di una riga: firmato e non scambiabile con quello dell'offerta", () => {
  const c = codiceFileRiga("abc123");
  assert.equal(leggiCodiceFileRiga(c), "abc123");
  assert.equal(leggiCodiceFileRiga("abc124." + c.split(".")[1]), null);
  assert.equal(leggiCodiceOfferta(c), null);
});
