// Schede tecniche del fotovoltaico portate dallo Studio (pannello, inverter, batteria): in fondo all'offerta stampata se spuntate,
// o da sole aprendo il link «apri la scheda» nella pagina dell'offerta.
import type { SchedaSolaris } from "@/lib/solaris/schede-offerta";

export default function SchedeSolaris({ schede }: { schede: SchedaSolaris[] }) {
  return (
    <>
      <h2 className="text-base font-bold mb-4" style={{ color: "#16A34A" }}>Schede tecniche dell&apos;impianto</h2>
      <div className="grid gap-4">
        {schede.map((sc) => (
          <div key={sc.titolo} className="border border-neutral-300 rounded-md p-4 print:break-inside-avoid">
            <p className="font-bold mb-2">{sc.titolo}</p>
            <table className="w-full text-sm">
              <tbody>
                {sc.voci.map(([l, v]) => (
                  <tr key={l} className="border-t border-neutral-100">
                    <td className="py-1 pr-4 text-neutral-600 w-1/2">{l}</td>
                    <td className="py-1 font-semibold">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}
