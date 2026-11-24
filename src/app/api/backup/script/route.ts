import { APP_URL } from "@/lib/mail/invio";
import { scriptPer } from "@/lib/backup/script";

export const dynamic = "force-dynamic";

// Lo script che gira sul NAS (nessun segreto dentro: la chiave sta in un file a parte sul NAS).
export async function GET() {
  return new Response(scriptPer(APP_URL), { headers: { "Content-Type": "text/x-shellscript; charset=utf-8", "Cache-Control": "no-store" } });
}
