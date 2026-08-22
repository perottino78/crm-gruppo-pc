const brands = ["P&C", "Solaris", "Purafonte", "Work & Services"];

export default function BrandSwitcher({ active = "P&C" }: { active?: string }) {
  return (
    <div className="flex gap-2">
      {brands.map((b) => (
        <span
          key={b}
          className={`text-xs font-medium px-3 py-1.5 rounded-full border ${
            b === active
              ? "bg-blue-50 text-blue-700 border-blue-200"
              : "border-neutral-200 text-neutral-500"
          }`}
        >
          {b}
        </span>
      ))}
    </div>
  );
}
