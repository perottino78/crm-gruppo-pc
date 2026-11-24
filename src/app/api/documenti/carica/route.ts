// Un documento (foto, PDF, Word…) alla volta nei Documenti di una scheda (Ugo 24/11/2026: «foto non funzionano ancora»):
// prima tutti i file partivano insieme dentro un'azione del server e le foto grezze del telefono (5-10 MB l'una)
// superavano il limite di Vercel (4,5 MB per richiesta). Ora il browser riduce le foto e le manda una per volta.
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puoVedereEntita } from "@/lib/documenti/server";
import { convertiInWebp } from "@/lib/immagini/webp";
import { ENTITA_DOCUMENTI, MAX_DOCUMENTO, nomeFileSicuro } from "@/lib/ordini/calcoli";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TIPI_AMMESSI = /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif)|text\/(plain|csv)|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-excel|zip|x-zip-compressed|octet-stream)|message\/rfc822)$/;
const PERCORSI: Record<string, (id: string) => string> = {
  CLIENTE: (id) => `/clienti/${id}`, PREVENTIVO: (id) => `/preventivi/${id}`, COMMESSA: (id) => `/commesse/${id}`, ORDINE_FORNITORE: (id) => `/ordini-fornitori/${id}`,
  ARTICOLO: (id) => `/prodotti/articoli/${id}`, BOLLA_ENTRATA: (id) => `/magazzino/bolle/${id}`, FATTURA_ACQUISTO: (id) => `/amministrazione/fatture-acquisto/${id}`, TASK: (id) => `/task/${id}`,
};

export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ ok: false, errore: "Sessione scaduta: riapri il CRM e riprova." }, { status: 401 });
  let fd: FormData;
  try { fd = await req.formData(); } catch { return NextResponse.json({ ok: false, errore: "File non ricevuto (troppo grande o connessione interrotta)." }, { status: 400 }); }
  const entita = String(fd.get("entita") ?? ""), entitaId = String(fd.get("entitaId") ?? "");
  if (!ENTITA_DOCUMENTI.includes(entita) || !entitaId) return NextResponse.json({ ok: false, errore: "Richiesta non valida." }, { status: 400 });
  if (!(await puoVedereEntita(u, entita, entitaId))) return NextResponse.json({ ok: false, errore: "Non autorizzato." }, { status: 403 });
  const cartella = (String(fd.get("cartella") ?? "").trim() || "Generale").slice(0, 60);
  const f = fd.get("file");
  if (!(f instanceof File) || !f.size) return NextResponse.json({ ok: false, errore: "File vuoto." }, { status: 400 });
  if (f.size > MAX_DOCUMENTO) return NextResponse.json({ ok: false, errore: `${f.name}: pesa più di 4 MB.` }, { status: 413 });
  const mime = f.type || "application/octet-stream";
  if (!TIPI_AMMESSI.test(mime)) return NextResponse.json({ ok: false, errore: `${f.name}: tipo di file non ammesso.` }, { status: 415 });
  // le foto diventano WebP leggero (PDF e il resto restano come sono)
  const w = await convertiInWebp({ contenuto: Buffer.from(await f.arrayBuffer()), mime, nome: f.name });
  const doc = await prisma.documento.create({ data: { entita, entitaId, cartella, nome: nomeFileSicuro(w.nome), mime: w.mime, dimensione: w.contenuto.length, contenuto: w.contenuto, caricatoDaNome: u.nome }, select: { id: true } });
  const p = PERCORSI[entita]?.(entitaId);
  if (p) revalidatePath(p);
  return NextResponse.json({ ok: true, id: doc.id, kb: Math.round(w.contenuto.length / 1024) });
}
