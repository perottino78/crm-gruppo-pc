// Modulo di rilievo / scheda di produzione del fornitore: stessi campi nell'ordine e nel «Carica rilievo» della pratica (Ugo 20/11/2026).
import TabellaLegno from "@/components/ordini/TabellaLegno";
import TabellaAngolari from "@/components/ordini/TabellaAngolari";
import { valoriDaRighe } from "@/lib/ordini/legno";
import { descriviCampi, nomeCampo, raggruppaCampi } from "@/lib/ordini/scheda-produzione";

const inp = "border border-neutral-300 rounded px-2 py-1 text-sm";

export default function ModuloScheda({ azione, nascosti, modello, righeLegno, angolariIniziali, salvaLegno, salvaAngolari, modificabile, testoPulsante = "📄 Crea la scheda", nota, dove, fornitori, fornitoreIniziale }: {
  azione: (fd: FormData) => Promise<void>;
  nascosti: { name: string; value: string }[];
  modello: { id: string; html: string };
  righeLegno: { codice: string | null; quantita: number }[];
  angolariIniziali: { iniziali: Record<string, string>; proposta: boolean };
  salvaLegno: (fd: FormData) => Promise<void>;
  salvaAngolari: (fd: FormData) => Promise<void>;
  modificabile: boolean;
  testoPulsante?: string;
  nota?: string;
  dove?: string;
  /** al rilievo: per quale fornitore è il modulo (la tabella del materiale ha solo le sue righe) */
  fornitori?: { id: string; nome: string }[];
  fornitoreIniziale?: string;
}) {
  const modelloScelto = modello;
  return (
    <form action={azione} className="space-y-2">
      {nascosti.map((h) => <input key={h.name} type="hidden" name={h.name} value={h.value} />)}
      <input type="hidden" name="modelloId" value={modelloScelto.id} />
      {fornitori && (
        <label className="block text-xs font-bold text-neutral-800">Fornitore di questo modulo (nella tabella del materiale vanno solo i suoi prodotti)
          <select name="fornitoreId" defaultValue={fornitoreIniziale ?? ""} className={`${inp} block w-full max-w-md`}>
            <option value="">— scegli il fornitore —</option>
            {fornitori.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </label>
      )}
      {(() => {
        const descritti = descriviCampi(modelloScelto.html);
        const { singoli, tabelle } = raggruppaCampi(descritti.map((d) => d.nome));
        const tipoDi = new Map(descritti.map((d) => [d.nome, d]));
        return (
          <>
            {tabelle.map((t) => t.gruppo === "ang" ? <TabellaAngolari key={t.gruppo} {...angolariIniziali} salva={salvaAngolari} modificabile={modificabile} dove={dove} /> : t.gruppo === "legno" ? <TabellaLegno key={t.gruppo} righe={t.righe} iniziali={valoriDaRighe(righeLegno)} salva={salvaLegno} modificabile={modificabile} dove={dove} /> : (
              <div key={t.gruppo} className="overflow-x-auto">
                <p className="text-xs font-bold text-neutral-800 mb-0.5">{nomeCampo(t.gruppo)}</p>
                <table className="text-xs border-collapse">
                  <thead><tr><th className="p-1" />{t.colonne.map((c) => <th key={c} className="border border-neutral-300 bg-neutral-50 px-1.5 py-0.5 font-semibold">{nomeCampo(c)}</th>)}</tr></thead>
                  <tbody>
                    {t.righe.map((r) => (
                      <tr key={r}>
                        <td className="px-1.5 font-semibold text-neutral-500">{r}</td>
                        {t.colonne.map((c) => <td key={c} className="border border-neutral-300 p-0"><input name={`campo_tab_${t.gruppo}_${r}_${c}`} className="w-20 px-1 py-1 text-xs" aria-label={`${nomeCampo(t.gruppo)} ${r} ${c}`} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {singoli.filter((c) => !(c === "prezzo_m3" && tabelle.some((t) => t.gruppo === "legno"))).map((c) => {
              const d = tipoDi.get(c);
              if (d && d.tipo !== "testo") {
                return (
                  <fieldset key={c} className="rounded border border-neutral-200 px-2 py-1">
                    <legend className="text-xs font-semibold px-1">{nomeCampo(c)}</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {d.opzioni.map((o) => (
                        <label key={o} className="text-xs flex items-center gap-1 font-normal">
                          <input type={d.tipo === "scelta" ? "radio" : "checkbox"} name={`campo_${c}`} value={o} /> {o}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              }
              return (
                <label key={c} className="text-xs font-semibold block">{nomeCampo(c)}
                  <textarea name={`campo_${c}`} rows={c.includes("misure") || c.includes("note") ? 4 : 1} className={`${inp} w-full`} placeholder={c.includes("misure_definitive") ? "Misure definitive per ogni elemento, es. Soggiorno – finestra 2 ante: L 1198 × H 1395 …" : ""} />
                </label>
              );
            })}
          </>
        );
      })()}
      <button className="btn-3d btn-3d-blue text-sm px-4 py-2">{testoPulsante}</button>
      {nota && <p className="text-[11px] text-neutral-500">{nota}</p>}
    </form>
  );
}
