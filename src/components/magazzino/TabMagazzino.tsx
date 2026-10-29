"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tab = [
  { href: "/magazzino", label: "Panoramica" },
  { href: "/magazzino/bolle", label: "Bolle d'entrata" },
  { href: "/magazzino/consegne", label: "Consegne attese" },
  { href: "/magazzino/commesse", label: "Materiale commesse" },
  { href: "/magazzino/giacenze", label: "Giacenze e scorte" },
  { href: "/magazzino/movimenti", label: "Movimenti" },
];

export default function TabMagazzino() {
  const p = usePathname();
  return (
    <div className="flex gap-1 border-b border-neutral-200 mb-5 print:hidden overflow-x-auto">
      {tab.map((t) => {
        const attivo = t.href === "/magazzino" ? p === t.href : p.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${attivo ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
