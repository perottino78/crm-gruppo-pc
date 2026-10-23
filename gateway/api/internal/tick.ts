import { tick } from "../../lib/handlers";
import { makeDeps } from "../../lib/runtime";
export const GET = tick(makeDeps); // Vercel Cron (GET + Authorization: Bearer $CRON_SECRET)
export const POST = tick(makeDeps); // QStash / scheduler esterno
