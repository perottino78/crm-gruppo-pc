import { prisma } from "@/lib/prisma";
import { calcolaPrezzo } from "@/lib/pricing";
import BrandSwitcher from "@/components/BrandSwitcher";

export default async function ProdottiPage() {
  const brand = await prisma.brand.findUnique({ where: { nome: "P&C" } });
  const totaleProdotti = await prisma.prodotto.count();
  const tipologie = await prisma.prodotto.groupBy({
    by: ["tipologia"],
    _count: { tipologia: true },
  });

  const esempi = brand
    ? await Promise.all([
        calcolaPrezzo({ brandId: brand.id, tipologia: "FF1", colore: "52", altezzaMm: 500, larghezzaMm: 500, paeseCliente: "IT" }),
        calcolaPrezzo({ brandId: brand.id, tipologia: "FF1", colore: "52", altezzaMm: 1000, larghezzaMm: 1000, paeseCliente: "IT" }),
        calcolaPrezzo({ brandId: brand.id, tipologia: "F1A1", colore: "52", altezzaMm: 1000, larghezzaMm: 1000, paeseCliente: "DE" }),
      ])
    : [];

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium">Prodotti &amp; listini</h1>
        <BrandSwitcher />
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-8">
        <p className="text-sm text-neutral-600">
          Listino fornitore importato: <span className="font-medium">{totaleProdotti}</span> combinazioni
          tipologia/colore/altezza/larghezza (da ILLUMIA 2023.xlsx). {tipologie.length} tipologie di infisso.
        </p>
      </div>

      <h2 className="text-sm font-medium text-neutral-700 mb-3">Motore prezzi — esempi calcolati dal vivo</h2>
      <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
        {esempi.map((e, i) =>
          e ? (
            <div key={i} className="px-4 py-3 text-sm flex items-center justify-between">
              <span className="text-neutral-500">
                base {e.prezzoBase.toFixed(2)} € × {e.coefficiente} + IVA ({e.regimeIva})
              </span>
              <span className="font-medium">
                {e.prezzoFinale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
              </span>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
