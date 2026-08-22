import Link from "next/link";
import { BRANDS } from "@/lib/brands";

export default function BrandSwitcher({ active = "Tutti" }: { active?: string }) {
  const pill = (nome: string, primary: string, primarySoft: string) => {
    const isActive = active === nome;
    return (
      <Link
        key={nome}
        href={`?brand=${encodeURIComponent(nome)}`}
        scroll={false}
        className="text-xs font-medium px-3 py-1.5 rounded-full border transition-colors"
        style={
          isActive
            ? { background: primarySoft, color: primary, borderColor: primary }
            : { background: "white", color: "#737373", borderColor: "#e5e5e5" }
        }
      >
        {nome}
      </Link>
    );
  };

  return (
    <div className="flex gap-2 flex-wrap">
      {pill("Tutti", "#404040", "#f5f5f5")}
      {BRANDS.map((b) => pill(b.nome, b.primary, b.primarySoft))}
    </div>
  );
}
