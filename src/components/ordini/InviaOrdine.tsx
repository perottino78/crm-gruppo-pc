"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviaOrdineEmail, type EsitoInvio } from "@/app/ordini-actions";

/** Invio dell'ordine: dalla casella ordini, con la lista senza prezzi e il rilievo della pratica allegato (come in BConsole). */
export default function InviaOrdine({ ordineId, a, cc, oggetto, testo, pdfUrl, giaInviato, fileRilievo = [], documenti = [], mittente, fornitore = "", tornaA = "/ordini-fornitori", tornaTesto = "← Torna alla pratica" }: { tornaA?: string; tornaTesto?: string; ordineId: string; a: string; cc: string; oggetto: string; testo: string; pdfUrl: string; giaInviato: boolean; fornitore?: string; fileRilievo?: { id: string; nome: string }[]; documenti?: { id: string; nome: string; cartella: string }[]; mittente: string }) {
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
  return (
    <div className="space-y-2">
      <div className="grid md:grid-cols-2 gap-2">
        <label className="text-xs font-semibold">A (email ordini del fornitore)<input value={dest} onChange={(e) => setDest(e.target.value)} className={inp} placeholder="ordini@fornitore.it" /></label>
        <label className="text-xs font-semibold">Copia a<input value={copia} onChange={(e) => setCopia(e.target.value)} className={inp} /></label>
      </div>
      <label className="text-xs font-semibold block">Oggetto<input value={ogg} onChange={(e) => setOgg(e.target.value)} className={inp} /></label>
      <label className="text-xs font-semibold block">Messaggio<textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={6} className={inp} /></label>
      <div className="rounded border border-neutral-200 bg-neutral-50 p-2 space-y-1 text-sm">
        <p className="text-xs text-neutral-700">Parte da <b>{mittente}</b>: le conferme del fornitore arrivano lì.</p>
        <label className="flex items-center gap-2"><input type="checkbox" checked={senzaPrezzi} onChange={(e) => setSenzaPrezzi(e.target.checked)} /> PDF senza prezzi (lista prodotti: il prezzo lo dà il fornitore con la conferma)</label>
        {fileRilievo.length > 0 ? (
          <div>
            <p className="text-xs font-bold text-neutral-800 mt-1">File del rilievo da allegare (scegli quelli di questo fornitore):</p>
            {fileRilievo.map((f) => (
              <label key={f.id} className="flex items-center gap-2 ml-2">
                <input type="checkbox" checked={scelti.includes(f.id)} onChange={(e) => setScelti(e.target.checked ? [...scelti, f.id] : scelti.filter((x) => x !== f.id))} />
                <span>{/\.pdf$/i.test(f.nome) ? "📄" : "🖼️"} {f.nome}</span>
                <a href={`/api/foto/rilievo/${f.id}`} target="_blank" rel="noopener" className="text-xs text-blue-800 underline">apri</a>
              </label>
            ))}
          </div>
        ) : <p className="text-xs text-neutral-500">Nessun rilievo caricato nella pratica da allegare.</p>}
        {documenti.length > 0 && (
          <div>
            <p className="text-xs font-bold text-neutral-800 mt-1">File delle cartelle del progetto:</p>
            {cartelle.map((c) => (
              <div key={c} className="ml-2">
                <p className="text-[11px] font-semibold text-neutral-600">📂 {c}</p>
                {documenti.filter((d) => d.cartella === c).map((d) => (
                  <label key={d.id} className="flex items-center gap-2 ml-2">
                    <input type="checkbox" checked={doc.includes(d.id)} onChange={(e) => setDoc(e.target.checked ? [...doc, d.id] : doc.filter((x) => x !== d.id))} />
                    <span>{d.nome}</span>
                    <a href={`/api/documenti/${d.id}`} target="_blank" rel="noopener" className="text-xs text-blue-800 underline">apri</a>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="mt-1">
          <p className="text-xs font-bold text-neutral-800">📎 Allega file dal computer (ordine cartaceo, disegno, foto):</p>
          <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { void aggiungiFile(e.target.files); e.target.value = ""; }} className="ml-2 text-xs" />
          {extra.map((f, i) => (
            <p key={i} className="ml-2 text-xs">{/\.pdf$/i.test(f.nome) ? "📄" : "🖼️"} {f.nome} <span className="text-neutral-500">({f.kb} KB)</span> <button type="button" onClick={() => setExtra(extra.filter((_, j) => j !== i))} className="text-red-700 underline">togli</button></p>
          ))}
          {avvisoFile && <p className="ml-2 text-xs text-red-700">{avvisoFile}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={invia} disabled={inCorso || !dest} className="btn-3d btn-3d-green text-sm px-4 py-2 disabled:opacity-50">{inCorso ? "Invio…" : giaInviato ? "✉ Reinvia per email con PDF" : "✉ Invia per email con PDF"}</button>
        <a href={`${pdfUrl}?scarica=1${senzaPrezzi ? "&prezzi=0" : ""}`} className="btn-3d btn-3d-dark text-sm px-4 py-2">⬇ Scarica PDF</a>
        <a href={`${pdfUrl}${senzaPrezzi ? "?prezzi=0" : ""}`} target="_blank" rel="noopener" className="text-sm text-blue-800 underline">anteprima</a>
      </div>
      {esito && <p className={`text-sm rounded p-2 ${esito.ok ? "bg-green-50 text-green-900" : esito.mailto ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"}`}>{esito.messaggio}</p>}
    </div>
  );
}
