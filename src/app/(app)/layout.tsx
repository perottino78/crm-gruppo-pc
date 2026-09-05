import { Suspense } from "react";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AccentBar from "@/components/AccentBar";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Suspense fallback={<div className="w-56 shrink-0 border-r border-neutral-200 bg-white" />}>
        <Sidebar utente={{ nome: utente.nome, ruolo: utente.ruolo }} logoutAction={logout} />
      </Suspense>
      <div className="flex-1 flex flex-col min-w-0">
        <Suspense fallback={<div className="h-1.5 w-full" />}>
          <AccentBar />
        </Suspense>
        <main className="flex-1 p-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
