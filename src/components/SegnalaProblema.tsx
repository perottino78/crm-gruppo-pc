"use client";

// «🆘 Segnala un problema» (richiesta di Ugo, nov 2026): in basso nel menu, vicino al proprio nome.
// Prende da solo il link della pagina; la schermata si fa con il pulsante, si incolla (Ctrl/Cmd+V) o si sceglie da file.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inviaSegnalazione, type EsitoSegnalazione } from "@/app/segnalazioni-actions";

type Img = { nome: string; blob: Blob; url: string };

/** Riduce un'immagine a max 1600 px in JPEG (le schermate del Mac sono enormi). */
async function riduci(blob: Blob, nome: string): Promise<Img> {
  if (!blob.type.startsWith("image/") || blob.type === "image/gif") return { nome, blob, url: URL.createObjectURL(blob) };
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const jpg = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.8));
    if (!jpg) throw new Error();
    const n = nome.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
    return { nome: n, blob: jpg, url: URL.createObjectURL(jpg) };
  } catch {
    return { nome, blob, url: URL.createObjectURL(blob) };
  }
}

export default function SegnalaProblema({ destinatario }: { destinatario: string | null }) {
  const [aperta, setAperta] = useState(false);
  const [nascosta, setNascosta] = useState(false); // mentre si fa la schermata
  const [testo, setTesto] = useState("");
  const [pagina, setPagina] = useState("");
  const [immagini, setImmagini] = useState<Img[]>([]);
  const [invio, setInvio] = useState(false);
  const [esito, setEsito] = useState<EsitoSegnalazione | null>(null);
  const campoFile = useRef<HTMLInputElement>(null);

  const apri = () => { setPagina(window.location.href); setEsito(null); setAperta(true); };
  const aggiungi = async (files: (File | Blob)[]) => {
    const nuove = await Promise.all(files.slice(0, 5).map((f, i) => riduci(f, (f as File).name || `schermata-${Date.now()}-${i}.png`)));
    setImmagini((v) => [...v, ...nuove].slice(0, 5));
  };

  // incolla una schermata con Ctrl/Cmd+V mentre la finestra è aperta
  useEffect(() => {
    if (!aperta) return;
    const incolla = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.items ?? [])].filter((x) => x.kind === "file" && x.type.startsWith("image/")).map((x) => x.getAsFile()).filter((x): x is File => !!x);
      if (files.length) { e.preventDefault(); aggiungi(files); }
    };
    window.addEventListener("paste", incolla);
    return () => window.removeEventListener("paste", incolla);
  }, [aperta]);

  // schermata della pagina: il browser chiede quale scheda/finestra condividere, si prende un fotogramma e si chiude subito
  const schermata = async () => {
    const md = navigator.mediaDevices as MediaDevices & { getDisplayMedia?: (o?: object) => Promise<MediaStream> };
    if (!md?.getDisplayMedia) { setEsito({ ok: false, messaggio: "Qui il pulsante non funziona: fai la schermata (Mac: Cmd+Maiusc+4, Windows: Win+Maiusc+S) e incollala con Cmd/Ctrl+V." }); return; }
    setNascosta(true);
    try {
      const stream = await md.getDisplayMedia({ video: true, audio: false, preferCurrentTab: true } as object);
      const video = document.createElement("video");
      video.srcObject = stream; video.muted = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 350));
      const c = document.createElement("canvas");
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext("2d")!.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      const png = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
      if (png) await aggiungi([new File([png], `schermata-${Date.now()}.png`, { type: "image/png" })]);
    } catch {
      /* annullata dall'utente */
    } finally {
      setNascosta(false);
    }
  };

  const invia = async () => {
    setInvio(true); setEsito(null);
    const fd = new FormData();
    fd.set("testo", testo); fd.set("pagina", pagina);
    for (const im of immagini) fd.append("file", new File([im.blob], im.nome, { type: im.blob.type }));
    try {
      const r = await inviaSegnalazione(fd);
      setEsito(r);
      if (r.ok) { setTesto(""); setImmagini([]); }
    } catch {
      setEsito({ ok: false, messaggio: "Non sono riuscito a inviarla: riprova tra poco." });
    } finally {
      setInvio(false);
    }
  };

  return (
    <>
      <button type="button" onClick={apri} className="mb-2 w-full rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-left text-[11px] font-bold text-red-800 hover:bg-red-100">
        🆘 Segnala un problema
      </button>
      {aperta && !nascosta && createPortal(
        // sopra tutta la pagina (non dentro il menu, che sul telefono scorre di lato)
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Segnala un problema">
          <div className="mt-6 w-full max-w-xl rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-black text-neutral-900">🆘 Segnala un problema</h2>
                <p className="text-xs text-neutral-600">Arriva a <b>{destinatario ?? "chi segue l'assistenza"}</b> con l&apos;amministratore in copia. Più dettagli dai, prima si risolve.</p>
              </div>
              <button type="button" onClick={() => setAperta(false)} className="rounded-full px-2 text-xl font-bold text-neutral-500 hover:bg-neutral-100" aria-label="Chiudi">✕</button>
            </div>
            {esito?.ok ? (
              <div className="space-y-3">
                <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {esito.messaggio}</p>
                <div className="flex gap-2">
                  <a href="/segnalazioni" className="btn-3d btn-3d-outline px-4 py-2 text-sm">Le mie segnalazioni</a>
                  <button type="button" onClick={() => setAperta(false)} className="btn-3d btn-3d-green px-4 py-2 text-sm">Chiudi</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-neutral-700">Cosa non va? Cosa stavi facendo?
                  <textarea value={testo} onChange={(e) => setTesto(e.target.value)} rows={4} autoFocus placeholder="es. premo «Salva» nell'offerta e non succede nulla" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs font-semibold text-neutral-700">Pagina dove sei (presa da sola)
                  <input value={pagina} onChange={(e) => setPagina(e.target.value)} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-xs text-neutral-700" />
                </label>
                <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-3">
                  <p className="text-xs font-semibold text-neutral-700">📸 Schermata (consigliata)</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {/* sul telefono il browser non sa fare la schermata: si fa col telefono e si sceglie da file */}
                    <button type="button" onClick={schermata} className="hidden md:inline-flex btn-3d btn-3d-blue px-3 py-1.5 text-xs">📸 Fai la schermata</button>
                    <button type="button" onClick={() => campoFile.current?.click()} className="btn-3d btn-3d-outline px-3 py-1.5 text-xs">📎 Scegli un file</button>
                    <input ref={campoFile} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { aggiungi([...(e.target.files ?? [])]); e.target.value = ""; }} />
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500 md:hidden">Dal telefono: fai la schermata (tasti laterali) e poi «Scegli un file».</p>
                  <p className="mt-1 hidden text-[11px] text-neutral-500 md:block">Oppure fai la schermata col computer (Mac: Cmd+Maiusc+4 · Windows: Win+Maiusc+S) e incollala qui con Cmd/Ctrl+V.</p>
                  {immagini.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {immagini.map((im, i) => (
                        <span key={im.url} className="relative">
                          {im.blob.type.startsWith("image/") ? <img src={im.url} alt={im.nome} className="h-20 w-28 rounded border border-neutral-200 object-cover" /> : <span className="flex h-20 w-28 items-center justify-center rounded border border-neutral-200 bg-white text-xs">📄 {im.nome}</span>}
                          <button type="button" onClick={() => setImmagini((v) => v.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-red-600 text-xs font-bold text-white" aria-label="Togli">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {esito && !esito.ok && <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{esito.messaggio}</p>}
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={invia} disabled={invio || testo.trim().length < 3} className="btn-3d btn-3d-red px-5 py-2 text-sm disabled:opacity-50">{invio ? "Invio…" : "🆘 Invia la segnalazione"}</button>
                  <a href="/segnalazioni" className="text-xs text-neutral-600 underline">le mie segnalazioni</a>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
