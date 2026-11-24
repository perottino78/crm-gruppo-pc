// Una foto della posa alla volta (Ugo 24/11/2026: «si passa già anche quelle»): il browser la riduce e la manda da sola,
// così le foto del telefono non superano mai il limite di Vercel come quando partivano tutte insieme.
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { convertiInWebp } from "@/lib/immagini/webp";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTE = 4_000_000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ ok: false, errore: "Sessione scaduta: riapri il CRM e riprova." }, { status: 401 });
  const { id } = await params;
  const p = await prisma.posa.findUnique({ where: { id }, select: { id: true, commessaId: true } });
  if (!p) return NextResponse.json({ ok: false, errore: "Posa non trovata." }, { status: 404 });
  let fd: FormData;
  try { fd = await req.formData(); } catch { return NextResponse.json({ ok: false, errore: "File non ricevuto (troppo grande o connessione interrotta)." }, { status: 400 }); }
  const f = fd.get("file");
  if (!(f instanceof File) || !f.size) return NextResponse.json({ ok: false, errore: "File vuoto." }, { status: 400 });
  if (f.size > MAX_BYTE) return NextResponse.json({ ok: false, errore: `${f.name}: pesa più di 4 MB.` }, { status: 413 });
  const cat = String(fd.get("categoria") ?? "DURANTE");
  const categoria = ["PRIMA", "DURANTE", "DOPO", "PROBLEMA"].includes(cat) ? cat : "DURANTE";
  let mime = f.type || "image/jpeg";
  if (!/^image\/(jpeg|png|webp|heic|heif|gif)$/i.test(mime)) return NextResponse.json({ ok: false, errore: `${f.name}: sono ammesse solo foto.` }, { status: 415 });
  const c = await convertiInWebp({ nome: f.name, mime, contenuto: Buffer.from(await f.arrayBuffer()) }, 1600, 75);
  mime = c.mime;
  const nome = (f.name || "foto").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const dataUri = `data:${mime};base64,${Buffer.from(c.contenuto).toString("base64")}`;
  const foto = await prisma.posaFoto.create({ data: { posaId: id, categoria, nome, dataUri, autoreNome: u.nome }, select: { id: true } });
  revalidatePath(`/commesse/${p.commessaId}`);
  revalidatePath("/lavori");
  return NextResponse.json({ ok: true, id: foto.id, nome });
}
