// Una foto (o un PDF) del rilievo alla volta (Ugo 24/11/2026: «problemi a caricare le foto del rilievo, sempre errore»):
// prima tutte le foto partivano insieme nel «Salva» e superavano il limite di dimensione delle richieste. Ora ogni file
// viaggia da solo (circa 200-400 KB), subito dopo la scelta, e il «Salva» manda solo le misure.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { convertiInWebp } from "@/lib/immagini/webp";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTE = 4_000_000; // sotto il limite di Vercel (4,5 MB per richiesta)

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ ok: false, errore: "Sessione scaduta: riapri il CRM e riprova." }, { status: 401 });
  const { id } = await params;
  const r = await prisma.rilievo.findUnique({ where: { id }, select: { id: true, commessaId: true } });
  if (!r) return NextResponse.json({ ok: false, errore: "Rilievo non trovato." }, { status: 404 });
  let file: File | null = null;
  try { const fd = await req.formData(); const f = fd.get("file"); file = f instanceof File ? f : null; } catch { return NextResponse.json({ ok: false, errore: "File non ricevuto (troppo grande o connessione interrotta)." }, { status: 400 }); }
  if (!file || !file.size) return NextResponse.json({ ok: false, errore: "File vuoto." }, { status: 400 });
  if (file.size > MAX_BYTE) return NextResponse.json({ ok: false, errore: `${file.name}: pesa più di 4 MB. Riducilo o caricalo nei Documenti della pratica.` }, { status: 413 });
  let contenuto: Buffer = Buffer.from(await file.arrayBuffer());
  let mime = file.type || "image/jpeg";
  if (contenuto.subarray(0, 4).toString("latin1") === "%PDF") mime = "application/pdf";
  if (!/^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/i.test(mime)) return NextResponse.json({ ok: false, errore: `${file.name}: tipo di file non ammesso (solo foto e PDF).` }, { status: 415 });
  // foto sempre leggere: se arrivano grandi (es. dal telefono senza riduzione) si riducono qui
  if (mime !== "application/pdf") { const c = await convertiInWebp({ nome: file.name, mime, contenuto }, 1600, 75); contenuto = Buffer.from(c.contenuto); mime = c.mime; }
  const nome = (file.name || "foto").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const dataUri = `data:${mime};base64,${contenuto.toString("base64")}`;
  const allegato = await prisma.rilievoAllegato.create({ data: { rilievoId: id, nome, dataUri }, select: { id: true } });
  // anche nelle cartelle della pratica (PDF in «Rilievi misura», foto in «Foto rilievi»), senza doppioni per nome
  const dove = { entita: "COMMESSA", entitaId: r.commessaId, cartella: mime === "application/pdf" ? "Rilievi misura" : "Foto rilievi", nome };
  if (!(await prisma.documento.findFirst({ where: dove, select: { id: true } }))) {
    await prisma.documento.create({ data: { ...dove, mime, dimensione: contenuto.length, contenuto, caricatoDaNome: u.nome } });
  }
  return NextResponse.json({ ok: true, id: allegato.id, nome, kb: Math.round(contenuto.length / 1024) });
}
