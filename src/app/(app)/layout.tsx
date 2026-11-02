import { Suspense } from "react";
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

  return (
    <div className="flex min-h-screen">
      <Suspense fallback={<div className="hidden md:block w-56 shrink-0 border-r border-neutral-200 bg-white" />}>
        <Sidebar utente={{ nome: utente.nome, ruolo: utente.ruolo, ufficio: utente.ufficio }} logoutAction={logout} />
      </Suspense>
      <div className="flex-1 flex flex-col min-w-0">
        <Suspense fallback={<div className="h-1.5 w-full" />}>
          <AccentBar />
        </Suspense>
        <main className="flex-1 px-3 pb-6 pt-16 md:p-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
