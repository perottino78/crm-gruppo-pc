import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { importaLead } from "@/lib/lead/importa-server";
import { rapportoCsv } from "@/lib/lead/importa";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST multipart: file (CSV) + esegui=0|1. Controlla il file o salva i lead nuovi. Solo chi può importare lead. */
export async function POST(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u || !(u.ruolo === "AMMINISTRATORE" || puo(u, "lead.importa"))) return NextResponse.json({ ok: false, errore: "Non hai il permesso di importare lead." }, { status: 403 });
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ ok: false, errore: "Scegli un file CSV." }, { status: 400 });
  if (file.size > 4_000_000) return NextResponse.json({ ok: false, errore: "File troppo grande (massimo 4 MB): dividilo in due." }, { status: 400 });
  if (/\.xlsx?$/i.test(file.name)) return NextResponse.json({ ok: false, errore: "Questo è un file Excel: aprilo e salvalo come «CSV (delimitato dal separatore di elenco)», poi caricalo qui." }, { status: 400 });
  // i CSV di Excel in italiano possono essere Windows-1252: si prova prima UTF-8 e, se ci sono caratteri rotti, l'altra codifica
  const buf = Buffer.from(await file.arrayBuffer());
  let testo = buf.toString("utf8");
  if (testo.includes("�")) testo = new TextDecoder("windows-1252").decode(buf);
  const r = await importaLead(testo, file.name, fd.get("esegui") === "1", u.nome);
  if (fd.get("rapporto") === "1" && r.ok) {
    const csv = rapportoCsv((r.esiti ?? []).map((e) => ({ riga: { riga: e.riga, nome: e.nome, telefono: e.telefono, email: e.email, marchio: "", provenienza: "", comune: "", cap: "", prodotto: "", note: "" }, stato: e.stato, motivo: e.motivo })));
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="lead-non-importati.csv"` } });
  }
  return NextResponse.json(r);
}
