import { type NextRequest } from "next/server";
import { chiaveValida, elencoBackup, tipoRichiesto } from "@/lib/backup/server";
import { elencoTesto } from "@/lib/backup/regole";

export const dynamic = "force-dynamic";

// Backup sul NAS (vedi scripts/backup/backup-one.sh): elenco delle parti da scaricare, una per riga. Serve la chiave (X-Backup-Key).
// Il NAS chiama ogni notte senza «tipo»: decide P&C ONE con la frequenza scelta in Impostazioni › Backup («# salta» = stanotte niente).
export async function GET(req: NextRequest) {
  if (!(await chiaveValida(req))) return new Response("chiave mancante o sbagliata\n", { status: 401 });
  const tipo = await tipoRichiesto(req.nextUrl.searchParams.get("tipo"));
  const h = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };
  if (!tipo) return new Response("# salta stanotte-niente-backup\n", { headers: h });
  const parti = await elencoBackup(tipo);
  const testo = elencoTesto(parti, {
    tipo, il: new Date().toISOString(), versione: process.env.VERCEL_GIT_COMMIT_SHA ?? "locale",
    nota: "righe-json-gzip-una-per-riga;ripristino-con-scripts/backup/ripristina.ts",
  });
  return new Response(testo, { headers: h });
}
