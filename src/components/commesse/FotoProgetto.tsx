import { prisma } from "@/lib/prisma";

/** Tutte le foto del progetto in un colpo d'occhio (rilievi, posa, documenti dell'offerta e della pratica), come in fondo al progetto di BConsole. */
export default async function FotoProgetto({ commessaId, preventivoId }: { commessaId: string; preventivoId: string }) {
  const [rilievo, posa, documenti] = await Promise.all([
    prisma.rilievoAllegato.findMany({ where: { rilievo: { commessaId, stato: { not: "ANNULLATO" } } }, select: { id: true, nome: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.posaFoto.findMany({ where: { posa: { commessaId } }, select: { id: true, nome: true, categoria: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.documento.findMany({
      where: { mime: { startsWith: "image/" }, OR: [{ entita: "COMMESSA", entitaId: commessaId }, { entita: "PREVENTIVO", entitaId: preventivoId }] },
      select: { id: true, nome: true, cartella: true, createdAt: true }, orderBy: { createdAt: "asc" },
    }),
  ]);
  const gruppi = [
    { titolo: "Rilievo", foto: rilievo.filter((f) => !/\.pdf$/i.test(f.nome ?? "")).map((f) => ({ id: f.id, src: `/api/foto/rilievo/${f.id}`, nome: f.nome ?? "foto rilievo" })) },
    { titolo: "Posa", foto: posa.map((f) => ({ id: f.id, src: `/api/foto/posa/${f.id}`, nome: `${f.categoria === "PRIMA" ? "prima" : f.categoria === "DOPO" ? "dopo" : f.categoria.toLowerCase()}${f.nome ? ` · ${f.nome}` : ""}` })) },
    { titolo: "Documenti (offerta e pratica)", foto: documenti.map((f) => ({ id: f.id, src: `/api/documenti/${f.id}`, nome: `${f.cartella} · ${f.nome}` })) },
  ].filter((g) => g.foto.length);
  const totale = gruppi.reduce((t, g) => t + g.foto.length, 0);
  return (
    <section id="foto" className="bg-white border border-neutral-200 rounded-lg p-4 print:hidden scroll-mt-4">
      <h2 className="font-bold text-neutral-900 mb-2">📷 Foto del progetto <span className="text-xs font-normal text-neutral-500">({totale})</span></h2>
      {totale === 0 && <p className="text-sm text-neutral-500">Nessuna foto ancora: arrivano dal rilievo, dalla posa e dai documenti.</p>}
      {gruppi.map((g) => (
        <div key={g.titolo} className="mb-3">
          <p className="text-xs font-bold text-neutral-700 mb-1">{g.titolo} ({g.foto.length})</p>
          <div className="flex flex-wrap gap-2">
            {g.foto.map((f) => (
              <a key={f.id} href={f.src} target="_blank" rel="noreferrer" title={f.nome}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.src} loading="lazy" alt={f.nome} className="h-24 w-24 object-cover rounded border border-neutral-300 hover:ring-2 hover:ring-blue-400" />
              </a>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
