"use server";

// Email al cliente scritta dentro P&C ONE (richiesta di Ugo, nov 2026: il pulsante «✉️ Email» apriva Mail del Mac).
// Parte dalla casella di chi scrive (o dall'aziendale con «rispondi a» lui), con la sua firma e gli allegati;
// resta nelle attività del cliente e i file presi dal computer finiscono nei suoi documenti (cartella Corrispondenza).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { scopeClienteWhere } from "@/lib/scope";
import { inviaMail, APP_URL } from "@/lib/mail/invio";
import { brandInfo } from "@/lib/brands";
import { emailOfferta, indirizzi } from "@/lib/mail/firma";
import { MAX_DOCUMENTO } from "@/lib/ordini/calcoli";

const MAX_TOTALE = 5.5 * 1024 * 1024; // il modulo arriva fino a 6 MB
const vai = (dove: string, p: Record<string, string>) => redirect(`${dove}${dove.includes("?") ? "&" : "?"}${new URLSearchParams(p)}`);

export async function inviaEmailCliente(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const id = String(fd.get("clienteId") ?? "");
  const torna = `/clienti/${id}/email`;
  const cliente = await prisma.cliente.findFirst({ where: { id, ...scopeClienteWhere(u!) }, include: { brand: true } });
  if (!cliente) redirect("/clienti");
  const c = cliente!;

  const a = indirizzi(String(fd.get("a") ?? ""));
  const cc = indirizzi(String(fd.get("cc") ?? "")).filter((x) => !a.includes(x));
  const oggetto = String(fd.get("oggetto") ?? "").trim();
  const testo = String(fd.get("testo") ?? "").trim();
  const firma = String(fd.get("firma") ?? "").trim();
  if (!a.length) vai(torna, { errore: "Scrivi l'indirizzo email del cliente" });
  if (!oggetto || !testo) vai(torna, { errore: "Oggetto e testo non possono essere vuoti" });

  // allegati: documenti del cliente (o delle sue offerte) + file presi dal computer
  const idDoc = fd.getAll("documento").map(String).filter(Boolean);
  const offerte = (await prisma.preventivo.findMany({ where: { clienteId: c.id }, select: { id: true } })).map((p) => p.id);
  const documenti = idDoc.length
    ? await prisma.documento.findMany({ where: { id: { in: idDoc }, OR: [{ entita: "CLIENTE", entitaId: c.id }, { entita: "PREVENTIVO", entitaId: { in: offerte } }] } })
    : [];
  const caricati = fd.getAll("file").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0);
  for (const f of caricati) if (f.size > MAX_DOCUMENTO) vai(torna, { errore: `«${f.name}» è troppo grande (massimo 4 MB per file)` });
  const nuovi = await Promise.all(caricati.map(async (f) => ({ nome: f.name, mime: f.type || "application/octet-stream", contenuto: Buffer.from(await f.arrayBuffer()) })));
  const totale = documenti.reduce((s, d) => s + d.dimensione, 0) + nuovi.reduce((s, f) => s + f.contenuto.length, 0);
  if (totale > MAX_TOTALE) vai(torna, { errore: "Allegati troppo pesanti (in tutto massimo 5 MB): togline qualcuno" });

  const info = brandInfo(c.brand?.nome);
  const corpo = emailOfferta({ testo, firma, link: null, colore: info.primary, logo: info.logoUrl ? `${APP_URL}${info.logoUrl}` : null });
  const allegati = [...documenti.map((d) => ({ nome: d.nome, contenuto: Buffer.from(d.contenuto), mime: d.mime })), ...nuovi];
  const esito = await inviaMail({ a, cc, oggetto, testo: corpo.testo, html: corpo.html, daUtenteId: u!.id, allegati });
  if (!esito.inviata) vai(torna, { errore: `Email non partita: ${esito.motivo ?? "errore sconosciuto"}` });

  // nello storico del cliente, con a chi è andata e gli allegati
  await prisma.attivita.create({
    data: {
      clienteId: c.id, tipo: "EMAIL", oggetto: `Email: ${oggetto}`, utenteId: u!.id, creatoDaId: u!.id, creatoDaNome: u!.nome, completata: true,
      descrizione: [`A: ${a.join(", ")}${cc.length ? ` · Cc: ${cc.join(", ")}` : ""}`, testo, allegati.length ? `Allegati: ${allegati.map((f) => f.nome).join(", ")}` : ""].filter(Boolean).join("\n\n"),
    },
  });
  for (const f of nuovi) {
    await prisma.documento.create({ data: { entita: "CLIENTE", entitaId: c.id, cartella: "Corrispondenza", nome: f.nome, mime: f.mime, dimensione: f.contenuto.length, contenuto: f.contenuto, caricatoDaNome: u!.nome } });
  }
  if (!c.email?.trim()) await prisma.cliente.update({ where: { id: c.id }, data: { email: a[0] } }).catch(() => {});
  if (fd.get("ricordaFirma") === "1" && firma) await prisma.utente.update({ where: { id: u!.id }, data: { firmaEmail: firma } });

  revalidatePath(`/clienti/${c.id}`);
  vai(`/clienti/${c.id}?sez=attivita`, { inviata: a.join(", ") });
}
