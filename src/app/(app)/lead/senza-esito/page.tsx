export const dynamic = "force-dynamic";

// «Appuntamenti senza esito» (richiesta di Cristina e Ugo, nov 2026): le visite passate che il commerciale non ha ancora esitato dopo N giorni
// (Impostazioni › Lead). Il centralino chiama il commerciale (o il cliente) e le fa esitare; appena esitate spariscono da qui.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { appuntamentiSenzaEsito, regoleEsiti } from "@/lib/appuntamenti/esiti-server";

const quando = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function SenzaEsitoPage() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "lead")) redirect("/");
  const r = await regoleEsiti();
  const lista = await appuntamentiSenzaEsito({ giorni: r.giorniLista, regole: r });
  const perUtente = new Map<string, typeof lista>();
  for (const a of lista) perUtente.set(a.utente, [...(perUtente.get(a.utente) ?? []), a]);
  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/lead" className="btn-indietro">← Task di oggi</Link>
      <div>
        <h1 className="text-2xl font-extrabold text-neutral-900">📋 Appuntamenti senza esito</h1>
        <p className="text-sm text-neutral-600">
          Visite già passate da almeno {r.giorniLista} giorn{r.giorniLista === 1 ? "o" : "i"} che il commerciale non ha ancora esitato (gli è già arrivato il promemoria).
          Chiamalo e fagli scegliere com&apos;è andata: appena esita, l&apos;appuntamento sparisce da qui e il tuo task sul lead si chiude.
        </p>
      </div>
      {lista.length === 0 && <p className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm font-semibold text-green-900">✅ Nessun appuntamento in attesa di esito.</p>}
      {[...perUtente.entries()].map(([nome, apps]) => (
        <section key={nome} className="rounded-lg border border-neutral-200 bg-white p-3">
          <h2 className="mb-2 font-bold text-neutral-900">{nome} <span className="text-sm font-normal text-red-700">· {apps.length} da esitare</span></h2>
          <ul className="divide-y divide-neutral-100">
            {apps.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span><b>{a.cliente}</b>{a.titolo ? ` · ${a.titolo}` : ""}<span className="block text-xs text-neutral-500">{quando(a.dataOra)} · {a.giorni} giorni fa</span></span>
                <Link href={`/calendario/appuntamento/${a.id}`} className="btn-3d btn-3d-outline px-3 py-1 text-xs">Apri e fai esitare</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
