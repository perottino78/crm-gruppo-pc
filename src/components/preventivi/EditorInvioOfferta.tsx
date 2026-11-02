"use client";

import { useMemo, useState } from "react";
import { emailOfferta } from "@/lib/mail/firma";
import { inviaOffertaEmail } from "@/app/offerte-email-actions";

type Doc = { id: string; nome: string; cartella: string; dove: string; kb: number };

/** Editor dell'email "Invia offerta": destinatari, oggetto, testo, firma di chi manda, link all'offerta e allegati. */
export default function EditorInvioOfferta(p: {
  id: string; a: string; cc: string; oggetto: string; testo: string; firma: string; firmaSalvata: boolean;
  colore: string; logo: string | null; documenti: Doc[]; avviso?: string | null; mittente: string;
}) {
  const [a, setA] = useState(p.a);
  const [cc, setCc] = useState(p.cc);
  const [oggetto, setOggetto] = useState(p.oggetto);
  const [testo, setTesto] = useState(p.testo);
  const [firma, setFirma] = useState(p.firma);
  const [conLink, setConLink] = useState(true);
  const [file, setFile] = useState<string[]>([]);
  const [invio, setInvio] = useState(false);
  const anteprima = useMemo(
    () => emailOfferta({ testo, firma, link: conLink ? "#" : null, colore: p.colore, logo: p.logo }).html,
    [testo, firma, conLink, p.colore, p.logo],
  );
  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

  return (
    <form action={inviaOffertaEmail} onSubmit={() => setInvio(true)} className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="conLink" value={conLink ? "1" : "0"} />
      <div className="flex flex-col gap-3">
        <label className="text-xs font-semibold text-neutral-700">A (email del cliente)
          <input name="a" value={a} onChange={(e) => setA(e.target.value)} className={campo} placeholder="cliente@email.it" required />
        </label>
        {p.avviso && <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">⚠️ {p.avviso}</p>}
        <label className="text-xs font-semibold text-neutral-700">Copia a (facoltativo, separati da virgola)
          <input name="cc" value={cc} onChange={(e) => setCc(e.target.value)} className={campo} placeholder="collega@gruppopec.com" />
        </label>
        <label className="text-xs font-semibold text-neutral-700">Oggetto
          <input name="oggetto" value={oggetto} onChange={(e) => setOggetto(e.target.value)} className={campo} required />
        </label>
        <label className="text-xs font-semibold text-neutral-700">Testo
          <textarea name="testo" value={testo} onChange={(e) => setTesto(e.target.value)} rows={9} className={campo} required />
        </label>
        <label className="flex items-start gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm">
          <input type="checkbox" checked={conLink} onChange={(e) => setConLink(e.target.checked)} className="mt-1" />
          <span><b>📄 Pulsante «Vedi e scarica l&apos;offerta»</b><br />
            <span className="text-xs text-neutral-600">Il cliente apre l&apos;offerta impaginata (come la stampa) e la salva in PDF. Vedrai qui quando la apre.</span></span>
        </label>
        <details className="rounded-md border border-neutral-200 bg-white px-3 py-2" open>
          <summary className="cursor-pointer text-sm font-semibold">✍️ Firma {p.firmaSalvata ? "" : <span className="text-xs font-normal text-neutral-500">(pronta dai tuoi dati: cambiala nel Profilo)</span>}</summary>
          <textarea name="firma" value={firma} onChange={(e) => setFirma(e.target.value)} rows={6} className={`${campo} mt-2 font-mono text-xs`} aria-label="Firma" />
          <label className="mt-1 flex items-center gap-2 text-xs text-neutral-600">
            <input type="checkbox" name="ricordaFirma" value="1" /> Ricorda questa firma per le prossime email
          </label>
        </details>
        <fieldset className="rounded-md border border-neutral-200 bg-white px-3 py-2">
          <legend className="px-1 text-sm font-semibold">📎 Allegati</legend>
          {p.documenti.length > 0 ? (
            <div className="flex flex-col gap-1">
              {p.documenti.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="documento" value={d.id} />
                  <span className="truncate">{d.nome}</span>
                  <span className="shrink-0 text-xs text-neutral-500">{d.dove} › {d.cartella} · {d.kb} KB</span>
                </label>
              ))}
            </div>
          ) : <p className="text-xs text-neutral-500">Nessun documento caricato nell&apos;offerta o nella scheda cliente.</p>}
          <label className="mt-2 block text-xs font-semibold text-neutral-700">Aggiungi dal computer (PDF dell&apos;offerta, foto, schede tecniche…)
            <input type="file" name="file" multiple onChange={(e) => setFile([...(e.target.files ?? [])].map((f) => f.name))} className="mt-1 block w-full text-xs" />
          </label>
          {file.length > 0 && <p className="mt-1 text-xs text-neutral-600">{file.length} file: restano anche nei documenti dell&apos;offerta (cartella Corrispondenza).</p>}
          <p className="mt-1 text-[11px] text-neutral-500">Massimo 4 MB per file, 5 MB in tutto.</p>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={invio} className="btn-3d btn-3d-green px-5 py-2 text-sm disabled:opacity-60">{invio ? "Invio in corso…" : "✉️ Invia offerta"}</button>
          <span className="text-xs text-neutral-600">Parte da: <b>{p.mittente}</b></span>
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-neutral-600">Anteprima di come la riceve il cliente</p>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2">
          <p className="truncate px-1 pb-1 text-sm"><b>{oggetto || "(senza oggetto)"}</b></p>
          <iframe title="Anteprima email" srcDoc={anteprima} sandbox="" className="h-[560px] w-full rounded-md border border-neutral-200 bg-white" />
        </div>
      </div>
    </form>
  );
}
