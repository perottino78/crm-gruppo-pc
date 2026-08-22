"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { brandInfo } from "@/lib/brands";

const moduli = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/clienti", label: "Clienti", icon: "👥" },
  { href: "/preventivi", label: "Preventivi", icon: "📄" },
  { href: "/prodotti", label: "Prodotti & listini", icon: "📦" },
  { href: "/report", label: "Report", icon: "📊" },
  { href: "/impostazioni", label: "Impostazioni", icon: "⚙️" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brand = searchParams.get("brand") ?? "Tutti";
  const info = brandInfo(brand === "Tutti" ? undefined : brand);

  return (
    <aside className="w-56 shrink-0 border-r border-neutral-200 bg-white flex flex-col py-4">
      <div className="px-4 pb-4 mb-2 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <span
            className="w-8 h-8 rounded-md flex items-center justify-center text-white text-sm font-bold"
            style={{ background: info.primary }}
          >
            PC
          </span>
          <div>
            <span className="text-base font-semibold text-neutral-900 leading-none block">Gruppo P&amp;C</span>
            <p className="text-[11px] text-neutral-400 leading-none mt-0.5">CRM — prototipo</p>
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
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors"
              style={
                active
                  ? { background: info.primarySoft, color: info.primary, fontWeight: 500 }
                  : { color: "#404040" }
              }
            >
              <span>{m.icon}</span>
              <span>{m.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-4 pt-4 text-[11px] text-neutral-300">
        Brand attivo: <span style={{ color: info.primary, fontWeight: 600 }}>{brand}</span>
      </div>
    </aside>
  );
}
