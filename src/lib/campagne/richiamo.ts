// «Chi clicca diventa una chiamata»: al primo clic su un'email di campagna con la spunta «richiama», il contatto finisce
// nei «Task di oggi» della telefonista. Riusa il lead del cliente (Cliente.leadOrigineId) o ne crea uno; non tocca chi ha
// già un appuntamento fissato e non duplica nulla se clicca più volte.
import { prisma } from "@/lib/prisma";
import { telefonistaDefaultPerBrand } from "@/lib/leadIngest";
import { FASI_APPUNTAMENTO, FASI_LEAD } from "@/lib/automazioni/percorsi";

export type EsitoRichiamo = "CREATO" | "RIAPERTO" | "ANTICIPATO" | "GIA_APPUNTAMENTO" | "NIENTE";

/** Cosa fare del lead quando il cliente clicca (regola pura, testata). */
export function azioneRichiamo(lead: { fase: string } | null): "CREA" | "RIAPRI" | "ANTICIPA" | "SOLO_NOTA" {
  if (!lead) return "CREA";
  if (FASI_APPUNTAMENTO.includes(lead.fase)) return "SOLO_NOTA";
  if (FASI_LEAD[lead.fase]?.chiusa) return "RIAPRI";
  return "ANTICIPA";
}

export async function richiamaDaCampagna(invioId: string, adesso = new Date()): Promise<EsitoRichiamo> {
  const invio = await prisma.campagnaInvio.findUnique({ where: { id: invioId }, include: { campagna: { select: { id: true, nome: true, richiama: true, richiamaTelefonistaId: true } } } });
  if (!invio?.campagna.richiama) return "NIENTE";
  const cliente = await prisma.cliente.findUnique({ where: { id: invio.clienteId } });
  if (!cliente) return "NIENTE";
  const lead = cliente.leadOrigineId ? await prisma.lead.findUnique({ where: { id: cliente.leadOrigineId } }) : null;
  const testo = `🖱️ Ha cliccato l'email della campagna «${invio.campagna.nome}»: è interessato, richiamalo per fissare l'appuntamento.`;
  const azione = azioneRichiamo(lead);
  const telefonista = async (attuale?: string | null) => {
    const scelta = invio.campagna.richiamaTelefonistaId
      ? await prisma.utente.findFirst({ where: { id: invio.campagna.richiamaTelefonistaId, stato: "ATTIVO" }, select: { id: true } })
      : null;
    return scelta?.id ?? attuale ?? (await telefonistaDefaultPerBrand(cliente.brandId));
  };
  if (azione === "SOLO_NOTA") {
    await prisma.leadEvento.create({ data: { leadId: lead!.id, tipo: "campagna.clic", testo: `${testo} (ha già un appuntamento fissato: nessuna chiamata in più)` } });
    return "GIA_APPUNTAMENTO";
  }
  if (azione === "ANTICIPA") {
    // lead già in lavorazione: la chiamata passa a oggi (se era più avanti) e resta nella sua fase
    const quando = lead!.scadenzaAzione && lead!.scadenzaAzione < adesso ? lead!.scadenzaAzione : adesso;
    await prisma.$transaction([
      prisma.lead.update({ where: { id: lead!.id }, data: { scadenzaAzione: quando, nonGestitoIl: null, telefonistaId: await telefonista(lead!.telefonistaId) } }),
      prisma.leadEvento.create({ data: { leadId: lead!.id, tipo: "campagna.clic", testo } }),
    ]);
    return "ANTICIPATO";
  }
  if (azione === "RIAPRI") {
    await prisma.$transaction([
      prisma.invioProgrammato.updateMany({ where: { leadId: lead!.id, stato: "IN_ATTESA" }, data: { stato: "ANNULLATO", errore: "ha cliccato una campagna: lo richiama la telefonista" } }),
      prisma.lead.update({ where: { id: lead!.id }, data: { fase: "RECUPERO", scadenzaAzione: adesso, nonGestitoIl: null, prodotto: lead!.prodotto ?? `Campagna: ${invio.campagna.nome}`.slice(0, 120), telefonistaId: await telefonista(lead!.telefonistaId) } }),
      prisma.leadEvento.create({ data: { leadId: lead!.id, tipo: "campagna.clic", testo: `${testo} (riaperto: era «${FASI_LEAD[lead!.fase]?.nome ?? lead!.fase}»)` } }),
    ]);
    return "RIAPERTO";
  }
  const nuovo = await prisma.lead.create({
    data: {
      nome: cliente.nome, telefono: cliente.telefono ?? cliente.cellulare, email: cliente.email, brandId: cliente.brandId, fonte: "campagna", fase: "RECUPERO",
      comune: cliente.comune, cap: cliente.cap, prodotto: `Campagna: ${invio.campagna.nome}`.slice(0, 120), scadenzaAzione: adesso, telefonistaId: await telefonista(),
      note: `Cliente già in anagrafica: ha cliccato l'email della campagna «${invio.campagna.nome}».`,
    },
  });
  await prisma.leadEvento.create({ data: { leadId: nuovo.id, tipo: "campagna.clic", testo } });
  // aggancia il lead al cliente (se la scheda non ne ha già uno)
  if (!cliente.leadOrigineId) await prisma.cliente.update({ where: { id: cliente.id }, data: { leadOrigineId: nuovo.id } }).catch(() => null);
  return "CREATO";
}
