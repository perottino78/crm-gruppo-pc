import type { Soggetto } from "@prisma/client";

export const RUOLI_LABEL: Record<string, string> = {
  FORNITORE: "Fornitore",
  POSATORE_ESTERNO: "Posatore esterno",
  TECNICO_INTERNO: "Tecnico / posatore interno",
  ALTRO: "Altro",
};

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm w-full";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-neutral-700">{label}</label>
      {children}
    </div>
  );
}

const dataIn = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default function SoggettoForm({
  s,
  utenti,
}: {
  s?: Soggetto | null;
  utenti: { id: string; nome: string }[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold text-neutral-800 mb-2">Ruoli (se ne possono scegliere più di uno)</p>
        <div className="flex flex-wrap gap-4">
          {Object.entries(RUOLI_LABEL).map(([k, l]) => (
            <label key={k} className="flex items-center gap-1.5 text-sm text-neutral-900">
              <input type="checkbox" name={`ruolo_${k}`} defaultChecked={s?.ruoli.includes(k)} /> {l}
            </label>
          ))}
          {s && (
            <label className="flex items-center gap-1.5 text-sm text-neutral-900">
              <input type="checkbox" name="attivo" defaultChecked={s.attivo} /> Attivo
            </label>
          )}
        </div>
      </div>

      <fieldset className="grid grid-cols-3 gap-3">
        <legend className="text-xs font-bold text-neutral-800 mb-1">Anagrafica</legend>
        <Campo label="Ragione sociale / Nome"><input name="ragioneSociale" required defaultValue={s?.ragioneSociale} className={inp} /></Campo>
        <Campo label="Tipo">
          <select name="tipo" defaultValue={s?.tipo ?? "AZIENDA"} className={inp}>
            <option value="AZIENDA">Azienda</option><option value="PERSONA">Persona fisica</option>
          </select>
        </Campo>
        <Campo label="Referente"><input name="referente" defaultValue={s?.referente ?? ""} className={inp} /></Campo>
        <Campo label="Partita IVA"><input name="partitaIva" defaultValue={s?.partitaIva ?? ""} className={inp} /></Campo>
        <Campo label="Codice fiscale"><input name="codiceFiscale" defaultValue={s?.codiceFiscale ?? ""} className={inp} /></Campo>
        <Campo label="Codice SDI"><input name="codiceSdi" defaultValue={s?.codiceSdi ?? ""} className={inp} /></Campo>
        <Campo label="Indirizzo"><input name="indirizzo" defaultValue={s?.indirizzo ?? ""} className={inp} /></Campo>
        <div className="grid grid-cols-3 gap-2">
          <Campo label="CAP"><input name="cap" defaultValue={s?.cap ?? ""} className={inp} /></Campo>
          <Campo label="Comune"><input name="comune" defaultValue={s?.comune ?? ""} className={inp} /></Campo>
          <Campo label="Prov."><input name="provincia" defaultValue={s?.provincia ?? ""} className={inp} /></Campo>
        </div>
        <Campo label="Telefono"><input name="telefono" defaultValue={s?.telefono ?? ""} className={inp} /></Campo>
        <Campo label="Email"><input name="email" defaultValue={s?.email ?? ""} className={inp} /></Campo>
        <Campo label="Email per ordini"><input name="emailOrdini" defaultValue={s?.emailOrdini ?? ""} className={inp} /></Campo>
        <Campo label="PEC"><input name="pec" defaultValue={s?.pec ?? ""} className={inp} /></Campo>
      </fieldset>

      <fieldset className="grid grid-cols-3 gap-3">
        <legend className="text-xs font-bold text-neutral-800 mb-1">Banca e pagamenti</legend>
        <Campo label="Banca"><input name="banca" defaultValue={s?.banca ?? ""} className={inp} /></Campo>
        <Campo label="IBAN"><input name="iban" defaultValue={s?.iban ?? ""} className={inp} /></Campo>
        <Campo label="BIC / SWIFT"><input name="bic" defaultValue={s?.bic ?? ""} className={inp} /></Campo>
        <Campo label="Intestatario conto"><input name="intestatario" defaultValue={s?.intestatario ?? ""} className={inp} /></Campo>
        <Campo label="Metodo di pagamento">
          <select name="metodoPagamento" defaultValue={s?.metodoPagamento ?? ""} className={inp}>
            <option value="">—</option><option>Bonifico</option><option>Riba</option><option>Contanti</option><option>Carta</option><option>Assegno</option>
          </select>
        </Campo>
        <Campo label="Giorni di pagamento"><input name="giorniPagamento" defaultValue={s?.giorniPagamento ?? ""} className={inp} placeholder="es. 30" /></Campo>
        <div className="col-span-3">
          <Campo label="Condizioni di pagamento"><input name="condizioniPagamento" defaultValue={s?.condizioniPagamento ?? ""} className={inp} placeholder="es. 30% all'ordine, saldo alla consegna" /></Campo>
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-3 gap-3">
        <legend className="text-xs font-bold text-neutral-800 mb-1">Fornitore</legend>
        <Campo label="Sconto concordato %"><input name="scontoFornitore" defaultValue={s?.scontoFornitore ?? ""} className={inp} /></Campo>
        <div className="col-span-2">
          <Campo label="Listini / brand forniti"><input name="listiniForniti" defaultValue={s?.listiniForniti ?? ""} className={inp} placeholder="es. Novowood, Illumia" /></Campo>
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-3 gap-3">
        <legend className="text-xs font-bold text-neutral-800 mb-1">Posa (esterni e interni)</legend>
        <Campo label="Tariffa posatore €">
          <input name="tariffaPosa" defaultValue={s?.tariffaPosa ?? ""} className={inp} />
        </Campo>
        <Campo label="Tariffa a">
          <select name="tariffaTipo" defaultValue={s?.tariffaTipo ?? ""} className={inp}>
            <option value="">—</option><option value="ORA">ora</option><option value="GIORNO">giorno</option><option value="MQ">m²</option><option value="PRESTAZIONE">prestazione</option>
          </select>
        </Campo>
        <Campo label="Costo orario interno €"><input name="costoOrario" defaultValue={s?.costoOrario ?? ""} className={inp} /></Campo>
        <Campo label="Zona operativa"><input name="zonaOperativa" defaultValue={s?.zonaOperativa ?? ""} className={inp} /></Campo>
        <Campo label="Scadenza DURC"><input type="date" name="scadenzaDurc" defaultValue={dataIn(s?.scadenzaDurc)} className={inp} /></Campo>
        <Campo label="Scadenza assicurazione"><input type="date" name="scadenzaAssicurazione" defaultValue={dataIn(s?.scadenzaAssicurazione)} className={inp} /></Campo>
        <Campo label="Utente CRM collegato (tecnici interni)">
          <select name="utenteId" defaultValue={s?.utenteId ?? ""} className={inp}>
            <option value="">—</option>
            {utenti.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </Campo>
      </fieldset>

      <Campo label="Note"><textarea name="note" rows={3} defaultValue={s?.note ?? ""} className={inp} /></Campo>
    </div>
  );
}
