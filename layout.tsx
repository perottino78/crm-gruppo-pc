import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { puoMagazzino } from "@/lib/magazzino/server";
import TabMagazzino from "@/components/magazzino/TabMagazzino";

export default async function MagazzinoLayout({ children }: { children: React.ReactNode }) {
  const u = await getCurrentUser();
  if (!puoMagazzino(u)) {
    return (
      <div className="max-w-xl bg-amber-50 border border-amber-300 rounded-lg p-5">
        <p className="font-bold text-amber-900">Area riservata a magazzino, ordini e amministrazione</p>
        <Link href="/" className="text-sm underline mt-3 inline-block">Torna alla dashboard</Link>
      </div>
    );
  }
  return (
    <div className="max-w-7xl">
      <h1 className="text-2xl font-bold text-neutral-900 mb-3">🏬 Magazzino</h1>
      <TabMagazzino />
      {children}
    </div>
  );
}
