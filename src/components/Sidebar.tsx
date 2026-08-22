import Link from "next/link";

const moduli = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/clienti", label: "Clienti", icon: "👥" },
  { href: "/preventivi", label: "Preventivi", icon: "📄" },
  { href: "/prodotti", label: "Prodotti & listini", icon: "📦" },
  { href: "/report", label: "Report", icon: "📊" },
  { href: "/impostazioni", label: "Impostazioni", icon: "⚙️" },
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-neutral-200 bg-white flex flex-col py-4">
      <div className="px-4 pb-4 mb-2 border-b border-neutral-100">
        <span className="text-lg font-medium text-neutral-900">Gruppo P&amp;C</span>
        <p className="text-xs text-neutral-400">CRM — prototipo</p>
      </div>
      <nav className="flex flex-col gap-1 px-2">
        {moduli.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-neutral-700 hover:bg-neutral-100"
          >
            <span>{m.icon}</span>
            <span>{m.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
