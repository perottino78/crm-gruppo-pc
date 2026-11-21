"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviaOrdineEmail, scaricaOrdineCompleto, type EsitoInvio } from "@/app/ordini-actions";
import { emailOfferta } from "@/lib/mail/firma";

/** Invio dell'ordine: dalla casella ordini, con la lista senza prezzi e il rilievo della pratica allegato (come in BConsole). */
export default function InviaOrdine({ ordineId, a, cc, oggetto, testo, pdfUrl, giaInviato, fileRilievo = [], documenti = [], mittente, fornitore = "", tornaA = "/ordini-fornitori", tornaTesto = "← Torna alla pratica", firma = "", colore = "#EA580C", logo = null }: { firma?: string; colore?: string; logo?: string | null; tornaA?: string; tornaTesto?: string; ordineId: string; a: string; cc: string; oggetto: string; testo: string; pdfUrl: string; giaInviato: boolean; fornitore?: string; fileRilievo?: { id: string; nome: string }[]; documenti?: { id: string; nome: string; cartella: string }[]; mittente: string }) {
  const [dest, setDest] = useState(a), [copia, setCopia] = useState(cc), [ogg, setOgg] = useState(oggetto), [corpo, setCorpo] = useState(testo);
  const [senzaPrezzi, setSenzaPrezzi] = useState(true);
  // file del rilievo da allegare: si sceglie quale (di partenza i PDF)
  const [scelti, setScelti] = useState<string[]>([]);
  // file delle cartelle del progetto: di partenza quelli di «Rilievi misura»
  // e la scheda di produzione già compilata al rilievo per questo fornitore (nel nome c'è il fornitore): è già spuntata, pronta da inviare
  const [doc, setDoc] = useState<string[]>(documenti.filter((d) => (d.cartella === "Schede produzione" && fornitore.length > 2 && d.nome.toLowerCase().includes(fornitore.toLowerCase()))).map((d) => d.id));
  const cartelle = [...new Set(documenti.map((d) => d.cartella))];
  // file dal computer (ordine cartaceo firmato, disegni): max ~3,4 MB in tutto per il limite delle richieste
  const [extra, setExtra] = useState<{ nome: string; dataUri: string; kb: number }[]>([]);
  const [avvisoFile, setAvvisoFile] = useState("");
  async function aggiungiFile(files: FileList | null) {
    if (!files) return;
    let tot = extra.reduce((t, f) => t + f.kb, 0);
    const nuovi = [...extra];
    setAvvisoFile("");
    for (const f of Array.from(files)) {
      if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)) { setAvvisoFile(`«${f.name}»: solo PDF o foto (JPG, PNG, WebP).`); continue; }
      if (tot + f.size / 1024 > 3400) { setAvvisoFile(`«${f.name}» non c'è più posto: in tutto al massimo 3,4 MB per invio (puoi mandare il resto con un secondo invio).`); continue; }
      const dataUri = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(f); });
      tot += f.size / 1024; nuovi.push({ nome: f.name, dataUri, kb: Math.round(f.size / 1024) });
    }
    setExtra(nuovi);
  }
  const [esito, setEsito] = useState<EsitoInvio | null>(null);
  const [inCorso, avvia] = useTransition();
  const inp = "border border-neutral-300 rounded px-2 py-1 text-sm w-full";
  const invia = () => avvia(async () => {
    const r = await inviaOrdineEmail(ordineId, dest, copia, ogg, corpo, { senzaPrezzi, fileRilievo: scelti, documenti: doc, extra: extra.map(({ nome, dataUri }) => ({ nome, dataUri })) });
    setEsito(r);
    if (r.mailto) window.location.href = r.mailto;
  });
  const router = useRouter();
  const [scaricando, avviaScarico] = useTransition();
  const [msgScarico, setMsgScarico] = useState("");
  // un solo PDF con l'ordine e tutti i file scelti (rilievi, cartelle, file dal computer), pronto da mandare in chat
  const scaricaTutto = () => avviaScarico(async () => {
    setMsgScarico("");
    const r = await scaricaOrdineCompleto(ordineId, { senzaPrezzi, fileRilievo: scelti, documenti: doc, extra: extra.map(({ nome, dataUri }) => ({ nome, dataUri })) });
    if (!r.ok || !r.base64) { setMsgScarico(r.messaggio ?? "Non sono riuscito a preparare il PDF."); return; }
    const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url; link.download = r.nome ?? "ordine.pdf"; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setMsgScarico(r.saltati?.length ? `PDF scaricato. Non si possono mettere nel PDF (solo nell'email): ${r.saltati.join(", ")}.` : "PDF scaricato con l'ordine e tutti i file scelti.");
  });
  // inviata davvero: si torna da soli alla pratica (per inviare gli altri ordini o chiudere)
  useEffect(() => {
    if (!esito?.ok) return;
    const t = setTimeout(() => router.push(tornaA), 2500);
    return () => clearTimeout(t);
  }, [esito, router, tornaA]);
  if (esito?.ok) {
    return (
      <div className="rounded-lg border-2 border-green-300 bg-green-50 p-4 space-y-3" role="status">
        <p className="text-lg font-bold text-green-900">✅ Ordine inviato al fornitore</p>
        <p className="text-sm text-green-900">{esito.messaggio}</p>
        <p className="text-xs text-neutral-600">Torno da solo alla pratica tra un attimo, per inviare gli altri ordini o chiudere.</p>
        <button onClick={() => router.push(tornaA)} className="btn-3d btn-3d-blue text-sm px-4 py-2">{tornaTesto} subito</button>
      </div>
    );
  }
  const nAllegati = scelti.length + doc.length + extra.length;
  const anteprima = emailOfferta({ testo: corpo, firma, colore, logo }).html;
  const sez = "rounded-xl border border-neutral-200 bg-white p-4 shadow-sm";
  const titolo = (n: number, t: string, sotto?: string) => (
    <div className="mb-3 flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white" style={{ background: colore }}>{n}</span>
      <div><h3 className="text-base font-extrabold text-neutral-900 leading-7">{t}</h3>{sotto && <p className="text-xs text-neutral-600 -mt-0.5">{sotto}</p>}</div>
    </div>
  );
  const riga = (id: string, nome: string, on: boolean, cambia: (v: boolean) => void, apri: string, icona: string) => (
    <label key={id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm cursor-pointer transition ${on ? "border-green-400 bg-green-50" : "border-neutral-200 bg-white hover:bg-neutral-50"}`}>
      <input type="checkbox" checked={on} onChange={(e) => cambia(e.target.checked)} className="h-4 w-4" />
      <span className="min-w-0 flex-1 truncate">{icona} {nome}</span>
      <a href={apri} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="shrink-0 text-xs font-semibold text-blue-800 underline">apri</a>
    </label>
  );
  return (
    <div className="space-y-4">
      <section className={sez}>
        {titolo(1, "A chi", `Parte da ${mittente}: le conferme del fornitore arrivano lì.`)}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold text-neutral-700">A (email ordini del fornitore)<input value={dest} onChange={(e) => setDest(e.target.value)} className={inp} placeholder="ordini@fornitore.it" /></label>
          <label className="text-xs font-bold text-neutral-700">Copia a (facoltativo)<input value={copia} onChange={(e) => setCopia(e.target.value)} className={inp} /></label>
        </div>
        <label className="mt-3 block text-xs font-bold text-neutral-700">Oggetto<input value={ogg} onChange={(e) => setOgg(e.target.value)} className={inp} /></label>
      </section>

      <section className={sez}>
        {titolo(2, "Messaggio", "La firma con il logo si aggiunge da sola in fondo.")}
        <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={7} className={inp} aria-label="Messaggio" />
        <details className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50" open>
          <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-neutral-800">👁️ Come lo vede il fornitore</summary>
          <iframe title="Anteprima email" sandbox="" srcDoc={anteprima} className="h-96 w-full rounded-b-lg border-t border-neutral-200 bg-white" />
        </details>
      </section>

      <section className={sez}>
        {titolo(3, "Allegati", nAllegati ? `${nAllegati} ${nAllegati === 1 ? "file scelto" : "file scelti"}: spunta quelli da mandare.` : "Spunta i file da mandare: niente è scelto di partenza.")}
        <label className="mb-3 flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
          <input type="checkbox" checked={senzaPrezzi} onChange={(e) => setSenzaPrezzi(e.target.checked)} className="h-4 w-4" />
          <span><b>📄 PDF dell&apos;ordine senza prezzi</b> <span className="text-xs text-neutral-600">— il prezzo lo dà il fornitore con la conferma</span></span>
        </label>
        {fileRilievo.length > 0 ? (
          <div className="mb-3">
            <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-neutral-600">📏 File del rilievo</p>
            <div className="grid gap-2 md:grid-cols-2">
              {fileRilievo.map((f) => riga(f.id, f.nome, scelti.includes(f.id), (v) => setScelti(v ? [...scelti, f.id] : scelti.filter((x) => x !== f.id)), `/api/foto/rilievo/${f.id}`, /\.pdf$/i.test(f.nome) ? "📄" : "🖼️"))}
            </div>
          </div>
        ) : <p className="mb-3 text-xs text-neutral-500">Nessun rilievo caricato nella pratica da allegare.</p>}
        {cartelle.map((c) => (
          <div key={c} className="mb-3">
            <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-neutral-600">📂 {c}</p>
            <div className="grid gap-2 md:grid-cols-2">
              {documenti.filter((d) => d.cartella === c).map((d) => riga(d.id, d.nome, doc.includes(d.id), (v) => setDoc(v ? [...doc, d.id] : doc.filter((x) => x !== d.id)), `/api/documenti/${d.id}`, "📄"))}
            </div>
          </div>
        ))}
        <div className="rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 p-3">
          <p className="text-xs font-extrabold uppercase tracking-wide text-neutral-600">📎 Dal computer</p>
          <p className="mb-2 text-xs text-neutral-600">Ordine cartaceo, disegno, foto (PDF o immagini, in tutto fino a 3,4 MB).</p>
          <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { void aggiungiFile(e.target.files); e.target.value = ""; }} className="text-xs" />
          {extra.map((f, i) => (
            <p key={i} className="mt-1 text-xs">{/\.pdf$/i.test(f.nome) ? "📄" : "🖼️"} <b>{f.nome}</b> <span className="text-neutral-500">({f.kb} KB)</span> <button type="button" onClick={() => setExtra(extra.filter((_, j) => j !== i))} className="text-red-700 underline">togli</button></p>
          ))}
          {avvisoFile && <p className="mt-1 text-xs text-red-700">{avvisoFile}</p>}
        </div>
      </section>

      <div className="sticky bottom-0 z-30 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <button onClick={invia} disabled={inCorso || !dest} className="btn-3d btn-3d-green px-6 py-2.5 text-base disabled:opacity-50">{inCorso ? "Invio…" : giaInviato ? "✉ Reinvia per email" : "✉ Invia per email"}</button>
        <button type="button" onClick={scaricaTutto} disabled={scaricando} className="btn-3d btn-3d-dark px-4 py-2.5 text-sm disabled:opacity-50" title="Un solo PDF con l'ordine e tutti i file che hai scelto">{scaricando ? "Preparo il PDF…" : "⬇ Scarica PDF con gli allegati"}</button>
        <a href={`${pdfUrl}${senzaPrezzi ? "?prezzi=0" : ""}`} target="_blank" rel="noopener" className="text-sm font-semibold text-blue-800 underline">anteprima del PDF</a>
        <span className="ml-auto text-xs text-neutral-600">{nAllegati ? `${nAllegati} allegati + ordine` : "solo l'ordine in PDF"}</span>
      </div>
      {msgScarico && <p className="rounded border border-neutral-200 bg-neutral-50 p-2 text-xs text-neutral-700">{msgScarico}</p>}
      {esito && <p className={`rounded p-2 text-sm ${esito.ok ? "bg-green-50 text-green-900" : esito.mailto ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"}`}>{esito.messaggio}</p>}
    </div>
  );
}
