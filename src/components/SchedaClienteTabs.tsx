"use client";

import { useState } from "react";
import type { Cliente, Utente, Referente, IndirizzoCliente, ClienteCorrelazione } from "@prisma/client";
import {
  aggiornaClienteAnagrafica,
  aggiornaClientePersonaFisica,
  aggiornaClienteProfilazione,
  aggiornaClienteCommerciale,
  aggiornaClienteAmministrazione,
  aggiornaClienteNote,
  creaReferente,
  eliminaReferente,
  creaIndirizzoCliente,
  eliminaIndirizzoCliente,
  creaCorrelazione,
  eliminaCorrelazione,
} from "@/app/actions";

type ClienteCompleto = Cliente & {
  responsabile: Utente | null;
  referenti: Referente[];
  indirizziAltri: IndirizzoCliente[];
  correlazioniDa: (ClienteCorrelazione & { correlato: Cliente })[];
  correlazioniA: (ClienteCorrelazione & { cliente: Cliente })[];
};

const TABS = [
  { id: "anagrafica", label: "Anagrafica" },
  { id: "profilazione", label: "Profilazione" },
  { id: "indirizzi", label: "Altri Indirizzi" },
  { id: "commerciale", label: "Commerciale" },
  { id: "amministrazione", label: "Amministrazione" },
  { id: "correlazioni", label: "Correlazioni" },
  { id: "maps", label: "Google Maps" },
  { id: "note", label: "Note" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const inputCls = "border border-neutral-200 rounded px-2 py-1.5 text-sm w-full";
const labelCls = "text-xs text-neutral-700 mb-1 block";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function dataInputValue(d: Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

export default function SchedaClienteTabs({
  cliente,
  utenti,
  altriClienti,
}: {
  cliente: ClienteCompleto;
  utenti: Utente[];
  altriClienti: { id: string; nome: string; comune: string | null }[];
}) {
  const [tab, setTab] = useState<TabId>("anagrafica");
  const [nuovoIndirizzoAperto, setNuovoIndirizzoAperto] = useState(false);

  const indirizzoCompleto = [cliente.indirizzo, cliente.cap, cliente.comune, cliente.provincia, cliente.paese]
    .filter(Boolean)
    .join(", ");
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(indirizzoCompleto || cliente.nome)}`;

  function SezioneReferenti() {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 p-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-neutral-900">👤 Referenti</h3>
        </div>
        <form action={creaReferente} className="flex flex-wrap items-end gap-2 mb-4 bg-neutral-50 rounded p-3">
          <input type="hidden" name="clienteId" value={cliente.id} />
          <Campo label="Nome *">
            <input name="nome" required className={inputCls + " w-32"} />
          </Campo>
          <Campo label="Cognome">
            <input name="cognome" className={inputCls + " w-32"} />
          </Campo>
          <Campo label="Ruolo">
            <input name="ruolo" placeholder="es. Amministratore" className={inputCls + " w-32"} />
          </Campo>
          <Campo label="Telefono">
            <input name="telefono" className={inputCls + " w-32"} />
          </Campo>
          <Campo label="Email">
            <input name="email" type="email" className={inputCls + " w-40"} />
          </Campo>
          <button className="btn-3d btn-3d-green text-xs px-3 py-1.5">+ Nuovo Referente</button>
        </form>
        {cliente.referenti.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-neutral-500">Non ci sono referenti per questa anagrafica!</p>
            <p className="text-xs text-neutral-400 mt-1">
              I referenti sono importanti perché sono le persone con le quali concretamente ti interfacci
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {cliente.referenti.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <strong>{r.nome} {r.cognome ?? ""}</strong>
                  {r.ruolo && <span className="text-neutral-500"> — {r.ruolo}</span>}
                  {(r.telefono || r.email) && (
                    <span className="text-neutral-500"> · {[r.telefono, r.email].filter(Boolean).join(" · ")}</span>
                  )}
                </span>
                <form action={eliminaReferente}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="clienteId" value={cliente.id} />
                  <button className="text-xs text-red-600 hover:underline">rimuovi</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="flex flex-wrap gap-1 border-b border-neutral-200 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            type="button"
            className={
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
              (tab === t.id
                ? "border-green-600 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-800")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "anagrafica" && (
        <div className="flex flex-col gap-4">
          <form action={aggiornaClienteAnagrafica} className="bg-white rounded-lg border border-neutral-200 p-4">
            <input type="hidden" name="id" value={cliente.id} />
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Campo label="Nome / Ragione sociale">
                <input name="nome" defaultValue={cliente.nome} className={inputCls} />
              </Campo>
              <Campo label="Telefono">
                <input name="telefono" defaultValue={cliente.telefono ?? ""} className={inputCls} />
              </Campo>
              <Campo label="Nazione">
                <input name="paese" defaultValue={cliente.paese} className={inputCls} />
              </Campo>
              <Campo label="Altro telefono">
                <input name="altroTelefono" defaultValue={cliente.altroTelefono ?? ""} className={inputCls} />
              </Campo>
              <Campo label="Comune">
                <input name="comune" defaultValue={cliente.comune ?? ""} className={inputCls} />
              </Campo>
              <Campo label="Cellulare">
                <input name="cellulare" defaultValue={cliente.cellulare ?? ""} className={inputCls} />
              </Campo>
              <Campo label="Frazione">
                <input name="frazione" defaultValue={cliente.frazione ?? ""} className={inputCls} />
              </Campo>
              <Campo label="www">
                <input name="sitoWeb" defaultValue={cliente.sitoWeb ?? ""} className={inputCls} />
              </Campo>
              <Campo label="Indirizzo">
                <input name="indirizzo" defaultValue={cliente.indirizzo ?? ""} className={inputCls} />
              </Campo>
              <Campo label="Email">
                <input name="email" type="email" defaultValue={cliente.email ?? ""} className={inputCls} />
              </Campo>
              <Campo label="CAP">
                <input name="cap" defaultValue={cliente.cap ?? ""} className={inputCls} />
              </Campo>
              <Campo label="Altra email">
                <input name="altraEmail" type="email" defaultValue={cliente.altraEmail ?? ""} className={inputCls} />
              </Campo>
              <Campo label="Provincia">
                <input name="provincia" defaultValue={cliente.provincia ?? ""} maxLength={2} className={inputCls} />
              </Campo>
              <Campo label="Email Invio Ord. Fornitore">
                <input name="emailOrdiniFornitore" type="email" defaultValue={cliente.emailOrdiniFornitore ?? ""} className={inputCls} />
              </Campo>
              <Campo label="Regione">
                <input name="regione" defaultValue={cliente.regione ?? ""} className={inputCls} />
              </Campo>
            </div>
            <div className="mt-3">
              <Campo label="Descrizione">
                <textarea name="descrizione" rows={2} defaultValue={cliente.descrizione ?? ""} className={inputCls} />
              </Campo>
            </div>
            <button className="btn-3d btn-3d-blue text-sm px-4 py-2 mt-3">salva anagrafica</button>
          </form>

          <form action={aggiornaClientePersonaFisica} className="bg-white rounded-lg border border-neutral-200 p-4">
            <input type="hidden" name="id" value={cliente.id} />
            <h3 className="text-sm font-bold text-neutral-900 mb-1">Dati persona fisica — calcolo Codice Fiscale automatico</h3>
            <p className="text-xs text-neutral-500 mb-3">
              Se il cliente è una persona fisica, compila questi campi: il Codice Fiscale viene calcolato e salvato in automatico (visibile/modificabile anche in Amministrazione).
            </p>
            <div className="grid grid-cols-3 gap-x-4 gap-y-3">
              <Campo label="Tipo anagrafica">
                <select name="tipoAnagrafica" defaultValue={cliente.tipoAnagrafica} className={inputCls}>
                  <option value="AZIENDA">Azienda</option>
                  <option value="PERSONA_FISICA">Persona fisica</option>
                </select>
              </Campo>
              <Campo label="Cognome">
                <input name="cognome" defaultValue={cliente.cognome ?? ""} className={inputCls} />
              </Campo>
              <Campo label="Nome">
                <input name="nomePersona" defaultValue={cliente.nomePersona ?? ""} className={inputCls} />
              </Campo>
              <Campo label="Sesso">
                <select name="sesso" defaultValue={cliente.sesso ?? ""} className={inputCls}>
                  <option value="">—</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </Campo>
              <Campo label="Data di nascita">
                <input name="dataNascita" type="date" defaultValue={dataInputValue(cliente.dataNascita)} className={inputCls} />
              </Campo>
              <Campo label="Comune di nascita">
                <input name="comuneNascita" defaultValue={cliente.comuneNascita ?? ""} placeholder="es. Vercelli" className={inputCls} />
              </Campo>
              <Campo label="Provincia di nascita">
                <input name="provinciaNascita" defaultValue={cliente.provinciaNascita ?? ""} maxLength={2} className={inputCls} />
              </Campo>
            </div>
            {cliente.codiceFiscale && (
              <p className="text-xs text-green-700 mt-2">
                ✓ Codice Fiscale attuale: <strong>{cliente.codiceFiscale}</strong>
              </p>
            )}
            <button className="btn-3d btn-3d-blue text-sm px-4 py-2 mt-3">salva e calcola CF</button>
          </form>
        </div>
      )}

      {tab === "profilazione" && (
        <form action={aggiornaClienteProfilazione} className="bg-white rounded-lg border border-neutral-200 p-4">
          <input type="hidden" name="id" value={cliente.id} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Campo label="Titolare Anagrafica">
              <select name="responsabileId" defaultValue={cliente.responsabileId ?? ""} className={inputCls}>
                <option value="">—</option>
                {utenti.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Bloccato">
              <label className="flex items-center gap-2 text-sm mt-1.5">
                <input type="checkbox" name="bloccato" defaultChecked={cliente.bloccato} />
                anagrafica bloccata
              </label>
            </Campo>
            <Campo label="Categoria">
              <input name="categoria" placeholder="es. Account, Cliente" defaultValue={cliente.categoria ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Origine">
              <input name="origine" defaultValue={cliente.origine ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Condivisioni">
              <input name="condivisioni" defaultValue={cliente.condivisioni ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Settore">
              <input name="settore" defaultValue={cliente.settore ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Tag">
              <input name="tag" placeholder="separati da virgola" defaultValue={cliente.tag ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Km">
              <input name="km" type="number" step="0.1" defaultValue={cliente.km ?? 0} className={inputCls} />
            </Campo>
            <Campo label="Tipologia">
              <input name="tipologia" defaultValue={cliente.tipologia ?? ""} className={inputCls} />
            </Campo>
          </div>
          <button className="btn-3d btn-3d-blue text-sm px-4 py-2 mt-3">salva profilazione</button>
        </form>
      )}

      {tab === "indirizzi" && (
        <div>
          <button
            type="button"
            onClick={() => setNuovoIndirizzoAperto((v) => !v)}
            className="btn-3d btn-3d-green text-xs px-3 py-1.5 mb-3"
          >
            📍 {nuovoIndirizzoAperto ? "annulla" : "Nuovo Indirizzo"}
          </button>
          {nuovoIndirizzoAperto && (
            <form action={creaIndirizzoCliente} className="bg-white rounded-lg border border-neutral-200 p-4 mb-4 flex flex-wrap items-end gap-2">
              <input type="hidden" name="clienteId" value={cliente.id} />
              <Campo label="Etichetta">
                <input name="etichetta" placeholder="es. Magazzino" className={inputCls + " w-40"} />
              </Campo>
              <Campo label="Indirizzo">
                <input name="indirizzo" className={inputCls + " w-56"} />
              </Campo>
              <Campo label="Comune">
                <input name="comune" className={inputCls + " w-40"} />
              </Campo>
              <Campo label="CAP">
                <input name="cap" className={inputCls + " w-24"} />
              </Campo>
              <Campo label="Provincia">
                <input name="provincia" maxLength={2} className={inputCls + " w-20"} />
              </Campo>
              <Campo label="Referente">
                <input name="referente" className={inputCls + " w-40"} />
              </Campo>
              <button className="btn-3d btn-3d-blue text-xs px-3 py-1.5">salva indirizzo</button>
            </form>
          )}

          <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-3">
            <p className="text-sm font-bold text-neutral-900 mb-1 border-l-4 border-green-600 pl-2">Sede Principale</p>
            <p className="text-sm text-neutral-700">
              {cliente.indirizzo ?? "—"} — {[cliente.cap, cliente.comune].filter(Boolean).join(" ")} {cliente.provincia && `(${cliente.provincia})`}
            </p>
          </div>

          {cliente.indirizziAltri.map((ind) => (
            <div key={ind.id} className="bg-white rounded-lg border border-neutral-200 p-4 mb-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-neutral-900 border-l-4 border-neutral-300 pl-2">{ind.etichetta}</p>
                <form action={eliminaIndirizzoCliente}>
                  <input type="hidden" name="id" value={ind.id} />
                  <input type="hidden" name="clienteId" value={cliente.id} />
                  <button className="text-xs text-red-600 hover:underline">rimuovi</button>
                </form>
              </div>
              <p className="text-sm text-neutral-700 mt-1">
                {ind.indirizzo ?? "—"} — {[ind.cap, ind.comune].filter(Boolean).join(" ")} {ind.provincia && `(${ind.provincia})`}
                {ind.referente && <> · referente: {ind.referente}</>}
              </p>
            </div>
          ))}
        </div>
      )}

      {tab === "commerciale" && (
        <form action={aggiornaClienteCommerciale} className="bg-white rounded-lg border border-neutral-200 p-4">
          <input type="hidden" name="id" value={cliente.id} />
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Campo label="Pagamento">
              <input name="pagamento" defaultValue={cliente.pagamento ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Centro di Ricavo">
              <input name="centroRicavo" defaultValue={cliente.centroRicavo ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Banca d'appoggio">
              <input name="bancaAppoggio" defaultValue={cliente.bancaAppoggio ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Codice Iva Cliente">
              <input name="codiceIvaCliente" defaultValue={cliente.codiceIvaCliente ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Euro al Km">
              <input name="euroAlKm" type="number" step="0.01" defaultValue={cliente.euroAlKm ?? 0} className={inputCls} />
            </Campo>
            <Campo label="Sconto (4 livelli %)">
              <div className="flex gap-1">
                <input name="scontoTier1" type="number" step="0.1" defaultValue={cliente.scontoTier1 ?? 0} className={inputCls + " w-16"} />
                <input name="scontoTier2" type="number" step="0.1" defaultValue={cliente.scontoTier2 ?? 0} className={inputCls + " w-16"} />
                <input name="scontoTier3" type="number" step="0.1" defaultValue={cliente.scontoTier3 ?? 0} className={inputCls + " w-16"} />
                <input name="scontoTier4" type="number" step="0.1" defaultValue={cliente.scontoTier4 ?? 0} className={inputCls + " w-16"} />
              </div>
            </Campo>
            <Campo label="Resa">
              <input name="resa" defaultValue={cliente.resa ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Tipo Costo">
              <input name="tipoCosto" defaultValue={cliente.tipoCosto ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Provvigione %">
              <input name="provvigione" type="number" step="0.1" defaultValue={cliente.provvigione ?? 0} className={inputCls} />
            </Campo>
            <Campo label="Corriere">
              <input name="corriere" defaultValue={cliente.corriere ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Budget Anno Corrente">
              <input name="budgetAnnoCorrente" type="number" step="0.01" defaultValue={cliente.budgetAnnoCorrente ?? 0} className={inputCls} />
            </Campo>
            <Campo label="Valuta">
              <input name="valuta" defaultValue={cliente.valuta ?? ""} placeholder="EUR" className={inputCls} />
            </Campo>
            <Campo label="Budget Anno Prossimo">
              <input name="budgetAnnoProssimo" type="number" step="0.01" defaultValue={cliente.budgetAnnoProssimo ?? 0} className={inputCls} />
            </Campo>
            <Campo label="Lingua">
              <input name="lingua" defaultValue={cliente.lingua ?? "it_IT"} className={inputCls} />
            </Campo>
            <div />
            <Campo label="Ns N. Fornitore">
              <input name="nsNumeroFornitore" defaultValue={cliente.nsNumeroFornitore ?? ""} className={inputCls} />
            </Campo>
            <div />
            <Campo label="Fido">
              <input name="fido" type="number" step="0.01" defaultValue={cliente.fido ?? ""} className={inputCls} />
            </Campo>
          </div>
          <button className="btn-3d btn-3d-blue text-sm px-4 py-2 mt-3">salva dati commerciali</button>
        </form>
      )}

      {tab === "amministrazione" && (
        <form action={aggiornaClienteAmministrazione} className="bg-white rounded-lg border border-neutral-200 p-4">
          <input type="hidden" name="id" value={cliente.id} />
          <h3 className="text-sm font-bold text-neutral-900 mb-3">Configurazione fattura elettronica</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Campo label="Email Invio Fatture">
              <input name="emailInvioFatture" type="email" defaultValue={cliente.emailInvioFatture ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Pec">
              <input name="pec" type="email" defaultValue={cliente.pec ?? ""} className={inputCls} />
            </Campo>
            <Campo label="REA">
              <input name="rea" defaultValue={cliente.rea ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Codice Destinatario">
              <input name="codiceDestinatario" defaultValue={cliente.codiceDestinatario ?? "0000000"} className={inputCls} />
            </Campo>
            <Campo label="ISO nazione">
              <input name="isoNazione" defaultValue={cliente.isoNazione ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Cod. EORI">
              <input name="codEori" defaultValue={cliente.codEori ?? ""} className={inputCls} />
            </Campo>
            <Campo label="P.Iva">
              <input name="piva" defaultValue={cliente.piva ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Fattura PA">
              <label className="flex items-center gap-2 text-sm mt-1.5">
                <input type="checkbox" name="fatturaPA" defaultChecked={cliente.fatturaPA} /> sì
              </label>
            </Campo>
            <Campo label="C.F.">
              <input name="codiceFiscale" defaultValue={cliente.codiceFiscale ?? ""} className={inputCls} />
            </Campo>
            <Campo label="Senza CIG/CUP">
              <label className="flex items-center gap-2 text-sm mt-1.5">
                <input type="checkbox" name="senzaCigCup" defaultChecked={cliente.senzaCigCup} /> sì
              </label>
            </Campo>
            <Campo label="Esigibilità IVA">
              <input name="esigibilitaIva" defaultValue={cliente.esigibilitaIva ?? "esigibilità immediata"} className={inputCls} />
            </Campo>
            <Campo label="Cessione Credito">
              <label className="flex items-center gap-2 text-sm mt-1.5">
                <input type="checkbox" name="cessioneCredito" defaultChecked={cliente.cessioneCredito} /> sì
              </label>
            </Campo>
            <Campo label="Regime Fiscale">
              <input name="regimeFiscale" defaultValue={cliente.regimeFiscale ?? "RF01 Ordinario"} className={inputCls} />
            </Campo>
            <Campo label="Soggetto a Ritenuta">
              <label className="flex items-center gap-2 text-sm mt-1.5">
                <input type="checkbox" name="soggettoRitenuta" defaultChecked={cliente.soggettoRitenuta} /> sì
              </label>
            </Campo>
            <div />
            <Campo label="Addebito Spese">
              <label className="flex items-center gap-2 text-sm mt-1.5">
                <input type="checkbox" name="addebitoSpese" defaultChecked={cliente.addebitoSpese} /> sì
              </label>
            </Campo>
            <div />
            <Campo label="Bollo in fattura">
              <label className="flex items-center gap-2 text-sm mt-1.5">
                <input type="checkbox" name="bolloInFattura" defaultChecked={cliente.bolloInFattura} /> sì
              </label>
            </Campo>
            <div />
            <Campo label="Addebito Bollo">
              <label className="flex items-center gap-2 text-sm mt-1.5">
                <input type="checkbox" name="addebitoBollo" defaultChecked={cliente.addebitoBollo} /> sì
              </label>
            </Campo>
            <Campo label="Importo Bollo">
              <input name="importoBollo" type="number" step="0.01" defaultValue={cliente.importoBollo ?? 0} className={inputCls} />
            </Campo>
          </div>
          <button className="btn-3d btn-3d-blue text-sm px-4 py-2 mt-3">salva amministrazione</button>
        </form>
      )}

      {tab === "correlazioni" && (
        <div>
          <form action={creaCorrelazione} className="bg-white rounded-lg border border-neutral-200 p-4 mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="clienteId" value={cliente.id} />
            <Campo label="Tipologia">
              <select name="tipologia" defaultValue="Account di fatturazione" className={inputCls + " w-56"}>
                <option>Account di fatturazione</option>
                <option>Sede collegata</option>
                <option>Gruppo societario</option>
                <option>Altro</option>
              </select>
            </Campo>
            <Campo label="Scegli account">
              <select name="correlatoId" required className={inputCls + " w-64"}>
                <option value="">—</option>
                {altriClienti.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}{c.comune ? ` (${c.comune})` : ""}</option>
                ))}
              </select>
            </Campo>
            <label className="flex items-center gap-1 text-xs mb-1.5">
              <input type="checkbox" name="principale" /> Principale
            </label>
            <button className="btn-3d btn-3d-green text-xs px-3 py-1.5">📍 Correla</button>
          </form>

          {cliente.correlazioniDa.length === 0 && cliente.correlazioniA.length === 0 ? (
            <p className="text-sm text-neutral-500 mb-4">Nessun account correlato</p>
          ) : (
            <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-6">
              {cliente.correlazioniDa.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>
                    {c.tipologia} → <strong>{c.correlato.nome}</strong>
                    {c.principale && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">principale</span>}
                  </span>
                  <form action={eliminaCorrelazione}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="clienteId" value={cliente.id} />
                    <button className="text-xs text-red-600 hover:underline">rimuovi</button>
                  </form>
                </div>
              ))}
              {cliente.correlazioniA.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2 text-sm text-neutral-600">
                  <span>{c.tipologia} ← <strong>{c.cliente.nome}</strong> (correlazione in ingresso)</span>
                </div>
              ))}
            </div>
          )}

          <SezioneReferenti />
        </div>
      )}

      {tab === "maps" && (
        <div className="bg-white rounded-lg border border-neutral-200 p-6 text-center">
          <p className="text-sm text-neutral-700 mb-1">{indirizzoCompleto || "Nessun indirizzo impostato"}</p>
          <p className="text-xs text-neutral-400 mb-4">La mappa incorporata non è attiva (nessuna API key configurata) — usa il link per aprire l&apos;indirizzo su Google Maps.</p>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="btn-3d btn-3d-blue text-sm px-4 py-2 inline-block">
            🗺️ Apri in Google Maps
          </a>
        </div>
      )}

      {tab === "note" && (
        <div>
          <form action={aggiornaClienteNote} className="bg-white rounded-lg border border-neutral-200 p-4 mb-2">
            <input type="hidden" name="id" value={cliente.id} />
            <textarea
              name="noteLibere"
              rows={6}
              defaultValue={cliente.noteLibere ?? ""}
              placeholder="Note libere su questa anagrafica..."
              className={inputCls}
            />
            <button className="btn-3d btn-3d-blue text-sm px-4 py-2 mt-2">salva note</button>
          </form>
          <SezioneReferenti />
        </div>
      )}
    </div>
  );
}
