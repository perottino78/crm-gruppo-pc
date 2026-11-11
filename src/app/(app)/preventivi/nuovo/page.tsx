export const dynamic = "force-dynamic";

// Nuovo preventivo in una pagina tutta sua (richiesta di Rocco: «per non creare confusione e mantenere il focus»).
// Si sceglie il cliente cercandolo, il commerciale (di partenza chi è collegato) e il marchio (di partenza quello del cliente);
// poi si passa alla pagina dell'offerta per righe, prezzi e condizioni.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { commercialiAttivi } from "@/lib/utenti/stato";
import { scopeClienteWhere } from "@/lib/scope";
import { creaPreventivo } from "@/app/actions";
import ClientePicker from "@/components/calendario/ClientePicker";

export default async function NuovoPreventivoPage({ searchParams }: { searchParams: Promise<{ cliente?: string; errore?: string }> }) {
  const p = await searchParams;
  const u = await getCurrentUser();
  const [brands, commerciali, cliente] = await Promise.all([
    prisma.brand.findMany({ orderBy: { nome: "asc" } }),
    commercialiAttivi(),
    p.cliente && u ? prisma.cliente.findFirst({ where: { AND: [{ id: p.cliente }, scopeClienteWhere(u)] }, select: { id: true, nome: true, brandId: true } }) : null,
  ]);
  const commercialeDiPartenza = commerciali.some((c) => c.id === u?.id) ? u!.id : "";
  const etichetta = "block text-xs font-semibold text-neutral-700 mb-1";
  const campo = "w-full border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white";

  return (
    <div className="max-w-xl">
      <Link href={cliente ? `/clienti/${cliente.id}` : "/preventivi"} className="btn-indietro">← {cliente ? cliente.nome : "Preventivi"}</Link>
      <h1 className="mt-3 text-2xl font-bold text-neutral-900">➕ Nuovo preventivo</h1>
      <p className="mt-1 text-sm text-neutral-600">Scegli per chi è l&apos;offerta. Righe, prezzi, sconto e condizioni si aggiungono nel passo successivo.</p>
      {p.errore && <p className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">⚠️ {p.errore}</p>}

      <form action={creaPreventivo} className="mt-5 space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div>
          <label className={etichetta}>1 · Cliente *</label>
          <ClientePicker iniziale={cliente ? { id: cliente.id, nome: cliente.nome } : null} />
          <p className="mt-1 text-[11px] text-neutral-500">Scrivi nome, telefono o comune e scegli dall&apos;elenco.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={etichetta}>2 · Commerciale *</label>
            <select name="commercialeId" required defaultValue={commercialeDiPartenza} className={campo}>
              <option value="">Scegli…</option>
              {commerciali.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className={etichetta}>3 · Marchio *</label>
            <select name="brandId" required defaultValue={cliente?.brandId ?? ""} className={campo}>
              <option value="">Scegli…</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={etichetta}>Oggetto dell&apos;offerta (facoltativo)</label>
          <input name="oggetto" placeholder="es. Serramenti in PVC per tutta la casa" className={campo} maxLength={300} />
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button className="btn-3d btn-3d-green px-5 py-2 text-sm">Crea il preventivo →</button>
          <Link href="/preventivi" className="text-sm text-neutral-600 underline">Annulla</Link>
        </div>
      </form>
    </div>
  );
}
