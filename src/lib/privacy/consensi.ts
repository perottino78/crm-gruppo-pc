// Registro dei consensi alle comunicazioni commerciali (il Garante chiede al titolare di poterli DIMOSTRARE).
// Ogni consenso o revoca è una riga di ConsensoMarketing (data, fonte, testo mostrato, versione dell'informativa, IP);
// sul cliente o sul lead resta la data dell'ultimo consenso valido (consensoMarketingIl): vuota = nessun consenso.
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { APP_URL } from "@/lib/mail/invio";
import { TESTO_CONSENSO_MARKETING } from "./informativa";

const SEGRETO = process.env.SESSION_SECRET || "gpc-2026-session-secret-x7f2-cambiami-in-produzione";
export const firmaConsenso = (clienteId: string) => createHmac("sha256", SEGRETO).update(`consenso-cliente:${clienteId}`).digest("hex").slice(0, 24);
export const linkConsensoCliente = (clienteId: string, campagnaId?: string) =>
  `${APP_URL}/api/consenso?c=${encodeURIComponent(clienteId)}&t=${firmaConsenso(clienteId)}${campagnaId ? `&k=${encodeURIComponent(campagnaId)}` : ""}`;
export const linkInformativa = () => `${APP_URL}/privacy`;

export const FONTI_CONSENSO: Record<string, string> = {
  MODULO_RICHIEDI: "Modulo di richiesta online", SIMULATORE: "Simulatore fotovoltaico", LINK_EMAIL: "Conferma dal link nell'email", DISISCRIZIONE: "Disiscrizione dal link nell'email",
  CONTRATTO: "Contratto firmato", MODULO_CARTACEO: "Modulo cartaceo", A_VOCE: "A voce o al telefono", MANUALE: "Inserito a mano",
};

type Dati = { clienteId?: string | null; leadId?: string | null; email?: string | null; stato: "CONCESSO" | "REVOCATO"; fonte: string; testo?: string | null; ip?: string | null; campagnaId?: string | null; utenteNome?: string | null; versioneInformativa?: string | null };

/** Registra un consenso o una revoca e aggiorna il cliente/lead. Un consenso esplicito toglie un'eventuale disiscrizione di prima; una revoca vale come disiscrizione. */
export async function registraConsenso(d: Dati) {
  if (!d.clienteId && !d.leadId) return null;
  const adesso = new Date();
  const riga = await prisma.consensoMarketing.create({
    data: {
      clienteId: d.clienteId ?? null, leadId: d.leadId ?? null, email: d.email?.trim().toLowerCase() || null, stato: d.stato, fonte: d.fonte,
      testo: d.stato === "CONCESSO" ? (d.testo ?? TESTO_CONSENSO_MARKETING) : (d.testo ?? null), versioneInformativa: d.versioneInformativa ?? null,
      ip: d.ip?.slice(0, 64) ?? null, campagnaId: d.campagnaId ?? null, utenteNome: d.utenteNome ?? null,
    },
  });
  const dati = d.stato === "CONCESSO" ? { consensoMarketingIl: adesso, disiscritto: false, disiscrittoIl: null } : { consensoMarketingIl: null, disiscritto: true, disiscrittoIl: adesso };
  if (d.clienteId) await prisma.cliente.update({ where: { id: d.clienteId }, data: dati }).catch(() => null);
  if (d.leadId) await prisma.lead.update({ where: { id: d.leadId }, data: dati }).catch(() => null);
  return riga;
}

/** Chi ha dato il consenso (e non l'ha revocato): solo a loro si misurano aperture e clic delle email. */
export const haConsenso = (x: { consensoMarketingIl?: Date | null; disiscritto?: boolean | null } | null | undefined) => !!x?.consensoMarketingIl && !x.disiscritto;
