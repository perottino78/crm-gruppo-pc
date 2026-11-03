"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { brandInfo } from "@/lib/brands";
import { IconaOne, LogoOne } from "@/components/LogoOne";
import { puo, permessoPagina } from "@/lib/permessi/catalogo";

const moduli: { href: string; label: string; icon: string; soloAmministrazione?: boolean; soloOrdini?: boolean; soloMarketing?: boolean }[] = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/lead", label: "Lead da lavorare", icon: "📞" },
  { href: "/clienti", label: "Clienti", icon: "👥" },
  { href: "/marketing", label: "Marketing", icon: "🚀", soloMarketing: true },
  { href: "/campagne", label: "Campagne", icon: "📣", soloMarketing: true },
  { href: "/preventivi", label: "Preventivi", icon: "📄" },
  { href: "/calendario", label: "Calendario", icon: "📅" },
  { href: "/comunicazioni", label: "Comunicazioni", icon: "💬" },
  { href: "/task", label: "Task pratiche", icon: "✅" },
  { href: "/commesse", label: "Commesse", icon: "🛠️" },
  { href: "/contratti", label: "Contratti e provvigioni", icon: "💼" },
  { href: "/ordini-fornitori", label: "Ordini fornitori", icon: "🚚", soloOrdini: true },
  { href: "/magazzino", label: "Magazzino", icon: "🏬", soloOrdini: true },
  { href: "/lavori", label: "Lavori / squadre", icon: "🔧" },
  { href: "/assistenza", label: "Assistenza", icon: "🛟" },
  { href: "/prodotti", label: "Prodotti & listini", icon: "📦" },
  { href: "/commerciali", label: "Team & performance", icon: "🏆" },
  { href: "/amministrazione", label: "Amministrazione", icon: "💶", soloAmministrazione: true },
  { href: "/archivio", label: "Archivio file", icon: "📁" },
  { href: "/report", label: "Report", icon: "📊", soloAmministrazione: true },
  { href: "/impostazioni", label: "Impostazioni", icon: "⚙️" },
];

export default function Sidebar({
  utente,
  logoutAction,
}: {
  utente?: { nome: string; ruolo: string; ufficio?: string | null; permessi?: string[]; profiloId?: string | null };
  logoutAction?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brand = searchParams.get("brand") ?? "Tutti";
  const info = brandInfo(brand === "Tutti" ? undefined : brand);
  // sul telefono il menu è nascosto: si apre con ☰ e si chiude da solo quando si cambia pagina
  const [aperto, setAperto] = useState(false);
  useEffect(() => { setAperto(false); }, [pathname, searchParams]);
  const voceAttiva = moduli.find((m) => (m.href === "/" ? pathname === "/" : pathname === m.href || pathname.startsWith(m.href + "/")));

  return (
    <>
    {/* barra in alto sul telefono */}
    <div className="md:hidden fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-3 border-b border-neutral-200 bg-white px-3 print:hidden">
      <button type="button" onClick={() => setAperto(true)} aria-label="Apri il menu" className="btn-3d btn-3d-outline px-3 py-1 text-lg leading-none">☰</button>
      <Link href="/" aria-label="P&C ONE: dashboard"><IconaOne size={32} /></Link>
      <span className="truncate text-sm font-bold text-neutral-900">{voceAttiva ? `${voceAttiva.icon} ${voceAttiva.label}` : "P&C ONE"}</span>
    </div>
    {aperto && <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setAperto(false)} />}
    <aside className={`${aperto ? "flex" : "hidden"} md:flex fixed md:static inset-y-0 left-0 z-50 w-64 md:w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white flex-col py-4 shadow-2xl md:shadow-none print:hidden`}>
      <button type="button" onClick={() => setAperto(false)} aria-label="Chiudi il menu" className="md:hidden absolute right-2 top-2 rounded px-2 text-2xl leading-none text-neutral-500">×</button>
      <div className="px-4 pb-4 mb-2 border-b border-neutral-100">
        <Link href="/" className="block"><LogoOne size={40} motto="Gruppo P&C" /></Link>
      </div>
      <nav className="flex flex-col gap-1 px-2">
        {moduli.filter((m) => { const k = permessoPagina(m.href); return !k || !utente || puo(utente, k); }).map((m) => {
          const active = m.href === "/" ? pathname === "/" : pathname === m.href || pathname.startsWith(m.href + "/");
          const href = brand !== "Tutti" ? `${m.href}?brand=${encodeURIComponent(brand)}` : m.href;
          return (
            <Link
              key={m.href}
              href={href}
              className="flex items-center gap-2 px-3 py-2.5 md:py-2 rounded-md text-sm border-l-4 transition-colors hover:bg-neutral-50"
              style={
                active
                  ? { background: info.primarySoft, color: info.primary, fontWeight: 700, borderLeftColor: info.primary }
                  : { color: "#1f2937", fontWeight: 500, borderLeftColor: "transparent" }
              }
            >
              <span>{m.icon}</span>
              <span>{m.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-4 pt-4 text-[11px] font-medium text-neutral-600">
        Brand attivo: <span style={{ color: info.primary, fontWeight: 700 }}>{brand}</span>
      </div>
      {utente && (
        <div className="px-4 pt-3 mt-3 border-t border-neutral-100">
          <p className="text-[11px] font-semibold text-neutral-900 leading-tight">{utente.nome}</p>
          <p className="text-[10px] text-neutral-500 leading-tight mb-2">{utente.ruolo}</p>
          <div className="flex items-center gap-2">
            <Link href="/profilo" className="text-[11px] font-medium text-neutral-600 hover:underline">
              Profilo
            </Link>
            <span className="text-neutral-300">·</span>
            <form action={logoutAction}>
              <button type="submit" className="text-[11px] font-medium text-red-600 hover:underline">
                Esci
              </button>
            </form>
          </div>
        </div>
      )}
    </aside>
    </>
  );
}
