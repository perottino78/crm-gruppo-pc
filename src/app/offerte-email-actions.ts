"use server";

// "Invia offerta" dalla scheda dell'offerta e firme email dei colleghi.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { scopePreventivoWhere } from "@/lib/scope";
import { inviaMail, APP_URL } from "@/lib/mail/invio";
import { brandInfo } from "@/lib/brands";
import { emailOfferta, indirizzi } from "@/lib/mail/firma";
import { linkOfferta } from "@/lib/mail/link-offerta";
import { MAX_DOCUMENTO } from "@/lib/ordini/calcoli";

const MAX_TOTALE = 5.5 * 1024 * 1024; // il modulo arriva fino a 6 MB

const vai = (dove: string, p: Record<string, string>) => redirect(`${dove}${dove.includes("?") ? "&" : "?"}${new URLSearchParams(p)}`);

export async function inviaOffertaEmail(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = String(fd.get("id") ?? "");
  const torna = `/preventivi/${id}/invia`;
  const p = await prisma.preventivo.findFirst({ where: { id, ...scopePreventivoWhere(u) }, include: { brand: true, cliente: true } });
  if (!p) vai("/preventivi", { errore: "Offerta non trovata" });
  const offerta = p!;

  const a = indirizzi(String(fd.get("a") ?? ""));
  const cc = indirizzi(String(fd.get("cc") ?? "")).filter((x) => !a.includes(x));
  const oggetto = String(fd.get("oggetto") ?? "").trim();
  const testo = String(fd.get("testo") ?? "").trim();
  const firma = String(fd.get("firma") ?? "").trim();
  const conLink = fd.get("conLink") === "1";
  if (!a.length) vai(torna, { errore: "Scrivi l'indirizzo email del cliente" });
  if (!oggetto || !testo) vai(torna, { errore: "Oggetto e testo non possono essere vuoti" });

  // allegati: documenti già caricati nell'offerta o nella scheda cliente + file presi dal computer
  const idDoc = fd.getAll("documento").map(String).filter(Boolean);
  const documenti = idDoc.length
    ? await prisma.documento.findMany({ where: { id: { in: idDoc }, OR: [{ entita: "PREVENTIVO", entitaId: offerta.id }, { entita: "CLIENTE", entitaId: offerta.clienteId }] } })
    : [];
  const caricati = fd.getAll("file").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0);
  for (const f of caricati) if (f.size > MAX_DOCUMENTO) vai(torna, { errore: `«${f.name}» è troppo grande (massimo 4 MB per file)` });
  const nuovi = await Promise.all(caricati.map(async (f) => ({ nome: f.name, mime: f.type || "application/octet-stream", contenuto: Buffer.from(await f.arrayBuffer()) })));
  const totale = documenti.reduce((s, d) => s + d.dimensione, 0) + nuovi.reduce((s, f) => s + f.contenuto.length, 0);
  if (totale > MAX_TOTALE) vai(torna, { errore: "Allegati troppo pesanti (in tutto massimo 5 MB): togline qualcuno, il cliente ha comunque il link all'offerta" });

  const info = brandInfo(offerta.brand?.nome);
  const link = conLink ? linkOfferta(APP_URL, offerta.id) : null;
  const corpo = emailOfferta({ testo, firma, link, colore: info.primary, logo: info.logoUrl ? `${APP_URL}${info.logoUrl}` : null });
  const allegati = [
    ...documenti.map((d) => ({ nome: d.nome, contenuto: Buffer.from(d.contenuto), mime: d.mime })),
    ...nuovi,
  ];
  const esito = await inviaMail({ a, cc, oggetto, testo: corpo.testo, html: corpo.html, daUtenteId: u!.id, allegati });

  await prisma.emailOfferta.create({
    data: {
      preventivoId: offerta.id, a: a.join(", "), cc: cc.join(", ") || null, oggetto, testo, conLink,
      allegati: allegati.map((f) => f.nome), inviataDa: u!.nome, da: esito.inviata ? esito.da ?? null : null,
      stato: esito.inviata ? "INVIATA" : "NON_INVIATA", motivo: esito.inviata ? null : esito.motivo ?? null,
    },
  });
  if (!esito.inviata) vai(torna, { errore: `Email non partita: ${esito.motivo ?? "errore sconosciuto"}` });

  // i file presi dal computer restano nell'offerta (cartella Corrispondenza), così si ritrovano
  for (const f of nuovi) {
    await prisma.documento.create({ data: { entita: "PREVENTIVO", entitaId: offerta.id, cartella: "Corrispondenza", nome: f.nome, mime: f.mime, dimensione: f.contenuto.length, contenuto: f.contenuto, caricatoDaNome: u!.nome } });
  }
  await prisma.preventivo.update({ where: { id: offerta.id }, data: { inviatoIl: new Date(), inviatoA: a.join(", ") } });
  // email del cliente mancante: la scriviamo nella scheda (solo se era vuota)
  if (!offerta.cliente.email?.trim()) await prisma.cliente.update({ where: { id: offerta.clienteId }, data: { email: a[0] } }).catch(() => {});
  // "ricorda questa firma": la firma scritta qui diventa quella del profilo
  if (fd.get("ricordaFirma") === "1" && firma) await prisma.utente.update({ where: { id: u!.id }, data: { firmaEmail: firma } });

  revalidatePath(`/preventivi/${offerta.id}`);
  vai(`/preventivi/${offerta.id}`, { inviata: a.join(", ") });
}

/** Salva la firma: la propria (dal Profilo) o quella di un collega (Impostazioni › Firme email, permesso "firme"). */
export async function salvaFirma(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const utenteId = String(fd.get("utenteId") ?? "") || u!.id;
  const t = String(fd.get("torna") ?? "");
  const torna = /^\/[A-Za-z]/.test(t) ? t : "/profilo";
  if (utenteId !== u!.id && !puo(u, "firme") && !puo(u, "marketing")) vai(torna, { errore: "Non hai il permesso di cambiare le firme dei colleghi" });
  const firma = String(fd.get("firma") ?? "").trim().slice(0, 8000);
  await prisma.utente.update({ where: { id: utenteId }, data: { firmaEmail: firma || null } });
  revalidatePath(torna.split("?")[0]);
  vai(`${torna.split("#")[0]}`, { firmaSalvata: utenteId });
}
