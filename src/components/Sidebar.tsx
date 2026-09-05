"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { brandInfo } from "@/lib/brands";

const moduli = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/clienti", label: "Clienti", icon: "👥" },
  { href: "/preventivi", label: "Preventivi", icon: "📄" },
  { href: "/prodotti", label: "Prodotti & listini", icon: "📦" },
  { href: "/commerciali", label: "Team & performance", icon: "🏆" },
  { href: "/report", label: "Report", icon: "📊" },
  { href: "/impostazioni", label: "Impostazioni", icon: "⚙️" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brand = searchParams.get("brand") ?? "Tutti";
  const info = brandInfo(brand === "Tutti" ? undefined : brand);

  return (
    <aside className="w-56 shrink-0 border-r border-neutral-200 bg-white flex flex-col py-4 print:hidden">
      <div className="px-4 pb-4 mb-2 border-b border-neutral-100">
        <div className="flex items-center gap-2.5">
          <span
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-base font-extrabold shadow-sm"
            style={{ background: `linear-gradient(135deg, ${info.primary}, ${info.accent})` }}
          >
            PC
          </span>
          <div>
            <span className="text-lg font-extrabold text-neutral-900 leading-none block">Gruppo P&amp;C</span>
            <p className="text-[11px] font-medium text-neutral-600 leading-none mt-1">CRM Gestionale</p>
          </div>
        </div>
      </div>
      <nav className="flex flex-col gap-1 px-2">
        {moduli.map((m) => {
          const active = pathname === m.href;
          const href = brand !== "Tutti" ? `${m.href}?brand=${encodeURIComponent(brand)}` : m.href;
          return (
            <Link
              key={m.href}
              href={href}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm border-l-4 transition-colors hover:bg-neutral-50"
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
    </aside>
  );
}
