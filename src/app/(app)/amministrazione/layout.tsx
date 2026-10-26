import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { puoAmministrazione } from "@/lib/amministrazione/server";
import TabAmministrazione from "@/components/amministrazione/TabAmministrazione";

export default async function AmministrazioneLayout({ children }: { children: React.ReactNode }) {
  const utente = await getCurrentUser();
  if (!puoAmministrazione(utente)) {
    return (
      <div className="max-w-xl bg-amber-50 border border-amber-300 rounded-lg p-5">
        <p className="font-bold text-amber-900">Area riservata all&apos;amministrazione</p>
        <p className="text-sm text-amber-900 mt-1">Per accedere serve il ruolo Amministratore o Amministrativo. Chiedi all&apos;amministratore di abilitarti da Impostazioni → Utenti.</p>
        <Link href="/" className="text-sm underline mt-3 inline-block">Torna alla dashboard</Link>
      </div>
    );
  }
  return (
    <div className="max-w-7xl">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold text-neutral-900">Amministrazione</h1>
      </div>
      <TabAmministrazione />
      {children}
    </div>
  );
}
