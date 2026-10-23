import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      nome, telefono, email, consensoPrivacy, localita,
      consumoKwh, prezzoEnergia, orientamento, inclinazione, batteria,
      kwp, risparmioStimato, rientroAnni,
      simulazioneJson,
    } = body;

    if (!nome?.trim() || !telefono?.trim()) {
      return NextResponse.json({ error: "nome e telefono obbligatori" }, { status: 400 });
    }
    if (!consensoPrivacy) {
      return NextResponse.json({ error: "consenso privacy obbligatorio" }, { status: 400 });
    }

    const brandSolaris = await prisma.brand.findFirst({ where: { nome: "Solaris" } });
    if (!brandSolaris) {
      return NextResponse.json({ error: "Brand Solaris non trovato" }, { status: 500 });
    }

    const lead = await prisma.leadSimulazione.create({
      data: {
        brandId: brandSolaris.id,
        nome: nome.trim(),
        telefono: telefono?.trim() || null,
        email: email?.trim() || null,
        consensoPrivacy: !!consensoPrivacy,
        localita: localita?.trim() || null,
        consumoKwh: consumoKwh ? +consumoKwh : null,
        prezzoEnergia: prezzoEnergia ? +prezzoEnergia : null,
        orientamento: orientamento != null ? +orientamento : null,
        inclinazione: inclinazione != null ? +inclinazione : null,
        batteria: batteria != null ? +batteria : null,
        kwp: kwp ? +kwp : null,
        risparmioStimato: risparmioStimato ? +risparmioStimato : null,
        rientroAnni: rientroAnni ? +rientroAnni : null,
        simulazioneJson: simulazioneJson ?? null,
        fonte: "simulatore_web",
        stato: "NUOVO",
      },
    });

    return NextResponse.json({ ok: true, id: lead.id });
  } catch (err) {
    console.error("Lead simula error:", err);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
