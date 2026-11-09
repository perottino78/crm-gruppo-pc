import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { emissioneReale, puoFatturazione } from "@/lib/fatturazione/server";
import TabFatturazione from "@/components/fatturazione/TabFatturazione";

export default async function FatturazioneLayout({ children }: { children: React.ReactNode }) {
  const utente = await getCurrentUser();
  if (!puoFatturazione(utente)) {
    return (
      <div className="max-w-xl bg-amber-50 border border-amber-300 rounded-lg p-5">
        <p className="font-bold text-amber-900">Area della fatturazione</p>
        <p className="text-sm text-amber-900 mt-1">Serve il permesso «Fatturazione» (ufficio Fatturazione o Amministrazione). Chiedi all&apos;amministratore da Impostazioni › Ruoli e permessi.</p>
        <Link href="/" className="text-sm underline mt-3 inline-block">Torna alla dashboard</Link>
      </div>
    );
  }
  const reale = await emissioneReale();
  return (
    <div className="max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 print:hidden">
        <h1 className="text-2xl font-bold text-neutral-900">Fatture e DDT</h1>
        {reale
          ? <span className="rounded-full bg-green-100 text-green-900 border border-green-300 px-3 py-1 text-xs font-semibold">Emissione vera: numeri validi</span>
          : <Link href="/fatturazione/impostazioni" className="rounded-full bg-violet-100 text-violet-900 border border-violet-300 px-3 py-1 text-xs font-semibold">🧪 Modalità prova: fatture e DDT con numero «PROVA», non validi</Link>}
      </div>
      <TabFatturazione />
      {children}
    </div>
  );
}
