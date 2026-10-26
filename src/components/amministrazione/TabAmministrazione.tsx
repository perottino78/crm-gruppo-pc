"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tab = [
  { href: "/amministrazione", label: "Cruscotto" },
  { href: "/amministrazione/scadenzario", label: "Scadenzario" },
  { href: "/amministrazione/prima-nota", label: "Prima nota" },
  { href: "/amministrazione/costi-ricavi", label: "Costi e ricavi" },
  { href: "/amministrazione/banche", label: "Banche e importazioni" },
];

export default function TabAmministrazione() {
  const p = usePathname();
  return (
    <div className="flex gap-1 border-b border-neutral-200 mb-6 print:hidden overflow-x-auto">
      {tab.map((t) => {
        const attivo = t.href === "/amministrazione" ? p === t.href : p.startsWith(t.href);
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
