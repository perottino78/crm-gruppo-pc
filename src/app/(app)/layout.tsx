import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { puo, permessoPagina, NOME_PERMESSO } from "@/lib/permessi/catalogo";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AccentBar from "@/components/AccentBar";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/actions";
import { eseguiDopoRisposta } from "@/lib/automazioni/motore";

// Mentre qualcuno usa il CRM gli invii scaduti partono anche senza il controllo periodico (al massimo una volta al minuto).
let ultimoControllo = 0;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const utente = await getCurrentUser();
  // sessione valida ma utente non più attivo (pausa/disattivato) o cancellato: si chiude la sessione
  if (!utente) redirect("/api/esci");
  if (Date.now() - ultimoControllo > 60_000) {
    ultimoControllo = Date.now();
    eseguiDopoRisposta();
  }

  // sezione non spuntata nel profilo: al posto della pagina un avviso
  const permesso = permessoPagina((await headers()).get("x-percorso") ?? "");
  const negato = permesso && !puo(utente, permesso);

  return (
    <div className="flex min-h-screen">
      <Suspense fallback={<div className="hidden md:block w-56 shrink-0 border-r border-neutral-200 bg-white" />}>
        <Sidebar utente={{ nome: utente.nome, ruolo: utente.ruolo, ufficio: utente.ufficio, permessi: utente.permessi, profiloId: utente.profiloId }} logoutAction={logout} />
      </Suspense>
      <div className="flex-1 flex flex-col min-w-0">
        <Suspense fallback={<div className="h-1.5 w-full" />}>
          <AccentBar />
        </Suspense>
        <main className="flex-1 px-3 pb-6 pt-16 md:p-8 print:p-0">
          {negato ? (
            <div className="max-w-xl rounded-lg border border-amber-300 bg-amber-50 p-5">
              <p className="font-bold text-amber-900">Questa sezione non è attiva per te</p>
              <p className="mt-1 text-sm text-amber-900">Il tuo profilo non comprende «{NOME_PERMESSO[permesso] ?? permesso}». Se ti serve, chiedi all&apos;amministratore di spuntarlo in Impostazioni › Ruoli e permessi.</p>
              <Link href="/" className="mt-3 inline-block text-sm underline">Torna alla dashboard</Link>
            </div>
          ) : children}
        </main>
      </div>
    </div>
  );
}
