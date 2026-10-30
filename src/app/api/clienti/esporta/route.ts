import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { scopeClienteWhere } from "@/lib/scope";
import { daOraRoma, aggiungiGiorni } from "@/lib/calendario/tempo";
import { whereFiltriClienti, rigaCsv, telefonoInternazionale, nomeCognome, type FiltriClienti } from "@/lib/clienti/provenienza";

export const dynamic = "force-dynamic";

// Esporta i clienti filtrati (stessi filtri della pagina Clienti) per le campagne.
// formato=facebook → colonne dei pubblici personalizzati di Meta (email, phone, fn, ln, ct, zip, country), virgola.
// altrimenti → tutte le colonne utili per Excel, con il punto e virgola. Rispetta la visibilità per ruolo.
// /api è fuori dal middleware di login: qui serve l'utente loggato.
export async function GET(req: NextRequest) {
  const utente = await getCurrentUser();
  if (!utente) return NextResponse.json({ error: "accesso richiesto" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const f: FiltriClienti = Object.fromEntries(["brand", "q", "indirizzo", "comune", "provincia", "cap", "paese", "provenienza", "stato", "commerciale", "dal", "al"].map((k) => [k, p.get(k) ?? undefined]));
  // Il filtro per commerciale è solo dell'amministratore (gli altri vedono già solo i propri)
  if (utente.ruolo !== "AMMINISTRATORE") f.commerciale = undefined;
  const dataDa = f.dal ? daOraRoma(`${f.dal}T00:00`) : null;
  const dataA = f.al ? daOraRoma(`${aggiungiGiorni(f.al, 1)}T00:00`) : null;
  const where: Prisma.ClienteWhereInput = { AND: [scopeClienteWhere(utente), ...whereFiltriClienti(f, dataDa, dataA)] };
  const clienti = await prisma.cliente.findMany({ where, orderBy: { createdAt: "desc" }, include: { brand: true, responsabile: { select: { nome: true } } } });

  const facebook = p.get("formato") === "facebook";
  const sep = facebook ? "," : ";";
  const righe: string[] = [];
  if (facebook) {
    righe.push(rigaCsv(["email", "phone", "fn", "ln", "ct", "zip", "country"], sep));
    for (const c of clienti) {
      if (!c.email && !c.telefono && !c.cellulare) continue;
      const n = nomeCognome(c.nome, c.nomePersona, c.cognome);
      righe.push(rigaCsv([c.email ?? "", telefonoInternazionale(c.cellulare ?? c.telefono), n.nome, n.cognome, c.comune ?? "", c.cap ?? "", (c.paese || "IT").toLowerCase()], sep));
    }
  } else {
    righe.push(rigaCsv(["Nome", "Telefono", "Cellulare", "Email", "Indirizzo", "CAP", "Comune", "Provincia", "Marchio", "Provenienza", "Stato lead", "Commerciale", "Arrivato il", "Tag"], sep));
    for (const c of clienti) {
      righe.push(rigaCsv([
        c.nome, c.telefono, c.cellulare, c.email, c.indirizzo, c.cap, c.comune, c.provincia, c.brand.nome, c.origine, c.statoLead, c.responsabile?.nome,
        c.createdAt.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }), c.tag,
      ], sep));
    }
  }
  const oggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  // BOM UTF-8: Excel legge correttamente accenti e simboli
  return new NextResponse("﻿" + righe.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="clienti-${facebook ? "facebook" : "excel"}-${oggi}.csv"`,
    },
  });
}
