export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import ImportaLead from "@/components/lead/ImportaLead";

/** Importazione di lead da un file CSV: modello da scaricare, controllo dei doppioni e salvataggio dei soli nuovi. */
export default async function ImportaLeadPage() {
  const u = await getCurrentUser();
  if (!u || !(u.ruolo === "AMMINISTRATORE" || puo(u, "lead.importa"))) notFound();
  const marchi = (await prisma.brand.findMany({ select: { nome: true }, orderBy: { nome: "asc" } })).map((b) => b.nome);
  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <Link href="/lead" className="btn-indietro">← Lead da lavorare</Link>
        <h1 className="text-2xl font-extrabold text-neutral-900">📥 Importa lead da un file</h1>
        <p className="text-sm text-neutral-600">Carichi un elenco, ONE controlla chi è già nel CRM (lead o clienti, per telefono o email) e salva solo i nuovi.</p>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="mb-2 text-sm font-bold text-neutral-900">1 · Scarica il modello e compilalo</p>
        <a href="/api/lead/modello-csv" className="btn-3d btn-3d-outline inline-block px-4 py-2 text-sm">⬇️ Scarica il modello (CSV)</a>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-neutral-700">
          <li>Si apre con Excel. Obbligatori: <b>Nome e cognome</b> e almeno uno fra <b>Telefono</b> ed <b>Email</b>. Gli altri campi sono facoltativi.</li>
          <li><b>Marchio</b>: {marchi.join(", ")} (se è vuoto o sconosciuto va su P&amp;C). <b>Provenienza</b>: scrivi liberamente (es. «Fiera Torino», «Passaparola»): serve per sapere da dove arrivano.</li>
          <li>Finito, salva da Excel come <b>CSV (delimitato dal separatore di elenco)</b> e caricalo qui sotto. Le colonne sono riconosciute anche con altri nomi («Cellulare», «Città», «Cognome» a parte…).</li>
          <li>I lead importati finiscono nei «Task di oggi» della telefonista del marchio, da classificare. <b>Non parte nessuna email.</b></li>
        </ul>
      </div>
      <ImportaLead />
    </div>
  );
}
