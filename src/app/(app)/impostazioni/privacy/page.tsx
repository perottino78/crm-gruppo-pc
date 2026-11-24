export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { INFORMATIVA_PREDEFINITA, leggiInformativa } from "@/lib/privacy/informativa";
import { salvaInformativa } from "@/app/privacy-actions";

/** Informativa privacy pubblica: il consulente la rivede qui; compare su /privacy e nei link di moduli, offerte ed email. */
export default async function InformativaPage({ searchParams }: { searchParams: Promise<{ salvato?: string }> }) {
  const u = await getCurrentUser();
  if (!u || !(puo(u, "marketing") || puo(u, "firme"))) notFound();
  const { salvato } = await searchParams;
  const { testo, versione, personalizzata } = await leggiInformativa();
  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <Link href="/impostazioni" className="btn-indietro">← Impostazioni</Link>
        <h1 className="text-2xl font-extrabold text-neutral-900">🔒 Informativa privacy</h1>
        <p className="text-sm text-neutral-600">
          Il testo che i clienti leggono su <a href="/privacy" target="_blank" className="underline text-blue-800">/privacy</a>: lo stesso link è nei moduli di richiesta, nelle offerte e in fondo alle email.
          {personalizzata ? ` Versione del ${versione}.` : " Ora c'è il testo di partenza (bozza): fallo rivedere dal consulente privacy e salvalo qui."}
        </p>
      </div>
      {salvato && <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">✓ Salvato</p>}
      <form action={salvaInformativa} className="card-fase space-y-2">
        <p className="text-xs text-neutral-600">Come si scrive: una riga vuota separa i paragrafi, una riga che inizia con «## » è un titolo, una che inizia con «- » è un elenco puntato. Lasciando il testo vuoto torna quello di partenza.</p>
        <textarea name="testo" rows={28} defaultValue={personalizzata ? testo : INFORMATIVA_PREDEFINITA} className="w-full border border-neutral-300 rounded px-3 py-2 text-sm font-mono" />
        <button className="btn-3d btn-3d-green text-sm px-4 py-2">💾 Salva l&apos;informativa</button>
      </form>
    </div>
  );
}
