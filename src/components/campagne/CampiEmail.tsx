"use client";

// Campi dell'email di una campagna: preheader, formato (testo nella grafica P&C o template HTML incollato / caricato).
import { useState } from "react";

const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";

export default function CampiEmail({ preheader, formato, testo, html, tracciamento }: { preheader: string; formato: string; testo: string; html: string; tracciamento: boolean }) {
  const [f, setF] = useState(formato === "HTML" ? "HTML" : "TESTO");
  const [ph, setPh] = useState(preheader);
  return (
    <div className="space-y-3">
      <label className="text-xs text-neutral-600 block">Preheader — il testo grigio che si legge accanto all&apos;oggetto nella casella di posta ({ph.length}/120, ideale 40-100 caratteri)
        <input name="preheader" value={ph} onChange={(e) => setPh(e.target.value)} maxLength={200} placeholder="es. Solo fino al 31 marzo: sconto in fattura e posa inclusa" className={`${inp} w-full`} />
      </label>
      <fieldset>
        <legend className="text-xs text-neutral-600 mb-1">Formato dell&apos;email</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[["TESTO", "✍️ Testo semplice", "scrivi il testo, il CRM lo impagina con la grafica P&C"], ["HTML", "🎨 Template HTML", "incolla l'HTML (da Mailchimp, Canva, Stripo, Brevo…) o carica il file .html"]].map(([v, t, d]) => (
            <label key={v} className={`flex cursor-pointer gap-2 rounded-lg border p-2 text-sm ${f === v ? "border-teal-500 bg-teal-50" : "border-neutral-200 bg-white"}`}>
              <input type="radio" name="formato" value={v} checked={f === v} onChange={() => setF(v)} className="mt-0.5" />
              <span><b>{t}</b><span className="block text-[11px] text-neutral-600">{d}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className={f === "TESTO" ? "" : "hidden"}>
        <label className="text-xs text-neutral-600 block">Testo (scrivi {"{nome}"} dove vuoi il nome del cliente)
          <textarea name="testo" rows={10} defaultValue={testo} placeholder={"Ciao {nome},\n\nfino al 31 marzo …\n\nA presto,\nGruppo P&C"} className={`${inp} w-full`} />
        </label>
      </div>
      <div className={f === "HTML" ? "space-y-2" : "hidden"}>
        <label className="text-xs text-neutral-600 block">Template HTML ({"{nome}"} per il nome, {"{disiscrizione}"} per il link di disiscrizione: se manca lo aggiunge il CRM in fondo)
          <textarea name="html" rows={14} defaultValue={html} spellCheck={false} placeholder={"<html><body>\n  <h1>Ciao {nome}!</h1>\n  <p>…</p>\n  <a href=\"https://gruppopec.com/promo\">Scopri l'offerta</a>\n</body></html>"} className={`${inp} w-full font-mono text-xs`} />
        </label>
        <label className="text-xs text-neutral-600 block">…oppure carica il file (.html, .htm; .txt per il testo semplice) — sostituisce quello incollato
          <input type="file" name="file" accept=".html,.htm,.txt,text/html,text/plain" className="block text-sm mt-1" />
        </label>
        <p className="text-[11px] text-neutral-500">Le immagini devono essere online (link https://…), non allegate: così l&apos;email resta leggera e arriva in casella e non nello spam.</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="tracciamento" defaultChecked={tracciamento} className="mt-1" />
        <span>📈 Traccia aperture e clic <span className="block text-[11px] text-neutral-500">Vedi chi l&apos;ha aperta e chi ha cliccato i link. Le aperture sono indicative: alcuni programmi di posta bloccano le immagini o le aprono da soli.</span></span>
      </label>
    </div>
  );
}
