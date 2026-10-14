import { webhookGET, webhookPOST } from "../../lib/handlers";
import { makeDeps } from "../../lib/runtime";

// URL da registrare in Meta (SOLO al momento del cutover autorizzato): https://<dominio-gateway>/api/meta/webhook
export const GET = webhookGET(makeDeps);
export const POST = webhookPOST(makeDeps);
