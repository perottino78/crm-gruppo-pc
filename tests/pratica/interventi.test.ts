import { test } from "node:test";
import assert from "node:assert/strict";
import { tipoValido, nomeIntervento, finePosaAperta, chiusuraIntervento } from "../../src/lib/pratica/interventi";

test("tipi di intervento: quelli sconosciuti diventano assistenza", () => {
  assert.equal(tipoValido("SECONDO_RILIEVO"), "SECONDO_RILIEVO");
  assert.equal(tipoValido("boh"), "ASSISTENZA");
  assert.equal(nomeIntervento("FINE_POSA"), "🔧 Fine posa");
});

test("fine posa aperta solo se c'è un intervento di fine posa non chiuso", () => {
  assert.equal(finePosaAperta([{ tipo: "MANUTENZIONE", stato: "APERTA" }]), false);
  assert.equal(finePosaAperta([{ tipo: "FINE_POSA", stato: "RISOLTA" }]), false);
  assert.equal(finePosaAperta([{ tipo: "FINE_POSA", stato: "PROGRAMMATA" }]), true);
});

test("chiusura: solo la fine posa con lavoro finito porta a lavori eseguiti", () => {
  assert.equal(chiusuraIntervento({ tipo: "FINE_POSA", lavoroFinito: true }, []).lavoriEseguiti, true);
  assert.equal(chiusuraIntervento({ tipo: "FINE_POSA", lavoroFinito: false }, []).lavoriEseguiti, false);
  assert.equal(chiusuraIntervento({ tipo: "MANUTENZIONE", lavoroFinito: true }, []).lavoriEseguiti, false);
  assert.equal(chiusuraIntervento({ tipo: "FINE_POSA", lavoroFinito: true }, [{ tipo: "FINE_POSA", stato: "APERTA" }]).lavoriEseguiti, false);
});
