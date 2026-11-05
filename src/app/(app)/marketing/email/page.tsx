export const dynamic = "force-dynamic";

import { puo } from "@/lib/permessi/catalogo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puoMarketing } from "@/lib/utenti/stato";
import { MODELLI } from "@/lib/automazioni/email";
import { PERCORSI, FASI_LEAD } from "@/lib/automazioni/percorsi";
import { testiPersonalizzati } from "@/lib/automazioni/motore";
import { VARIANTI, NOMI_EMAIL, NOMI_VARIANTI, SEGNAPOSTO, chiaveTesto, testoStandard, valoriSegnaposto } from "@/lib/automazioni/personalizza";
import { salvaTestoEmail, ripristinaTestoEmail } from "@/app/marketing-actions";
import EditorEmail from "@/components/marketing/EditorEmail";

type P = { ok?: string; errore?: string; aperta?: string };

// cliente di esempio per le anteprime
const ESEMPIO = {
  nome: "Mario Rossi", telefono: "333 1234567", email: "mario.rossi@email.it", comune: "Rivoli", cap: "10098", prodotto: "Pergola bioclimatica", fonte: "FACEBOOK", marchio: "P&C",
  richiamoIl: new Date(Date.now() + 2 * 86400000), appuntamentoIl: new Date(Date.now() + 5 * 86400000), indirizzoAppuntamento: "Via Roma 10, 10098 Rivoli",
  note: "Interessato anche alle zanzariere", venditore: { nome: "Marco Piccatti", telefono: "333 0000000", email: "marco.piccatti@gruppopec.com" },
  promozione: { testo: "• Sconto in fattura sulle pergole bioclimatiche\n• Finanziamento su misura sugli infissi", validaFino: new Date(Date.now() + 30 * 86400000) },
};

/** In quali percorsi parte ogni email (per capire quando la riceve il cliente). */
function dovePart(modello: string): string[] {
  const out: string[] = [];
  for (const [percorso, passi] of Object.entries(PERCORSI)) for (const p of passi) if ((p as { modello?: string }).modello === modello) out.push(`${FASI_LEAD[percorso]?.nome ?? percorso.toLowerCase().replace(/_/g, " ")}: ${p.nome}`);
  return [...new Set(out)];
}

export default async function EmailAutomatichePage({ searchParams }: { searchParams: Promise<P> }) {
  const u = await getCurrentUser();
  if (!u || !puo(u, "automazioni")) notFound();
  const p = await searchParams;
  const testi = await testiPersonalizzati();
  const voci = Object.keys(MODELLI).flatMap((m) => (VARIANTI[m] ?? [undefined]).map((v) => ({ m, v })));
  const gruppi: [string, typeof voci][] = [
    ["📨 Email al cliente", voci.filter((x) => MODELLI[x.m].categoria === "CLIENTE")],
    ["🏢 Email interne (centralino e venditori)", voci.filter((x) => MODELLI[x.m].categoria === "INTERNA")],
  ];
  const nPers = voci.filter((x) => testi.has(chiaveTesto(x.m, x.v))).length;

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <Link href="/marketing" className="btn-indietro">← Marketing</Link>
        <h1 className="text-2xl font-extrabold text-neutral-900">✏️ Testi delle email automatiche</h1>
        <p className="text-sm text-neutral-600">
          Tutte le email che il CRM manda da solo durante il percorso dei lead. Apri un&apos;email, cambia oggetto e testo e salva: da quel momento
          partono con il nuovo testo. Le parole tra graffe (es. <code>{"{nome}"}</code>) si riempiono con i dati del cliente. {nPers} di {voci.length} personalizzate.
        </p>
      </div>
      {p.ok && <p className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">✅ {p.ok}</p>}
      {p.errore && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{p.errore}</p>}

      <details className="card-fase" style={{ ["--fase" as string]: "#7c3aed" }}>
        <summary className="cursor-pointer text-sm font-bold text-neutral-900">🔤 Segnaposto che puoi usare nei testi ({SEGNAPOSTO.length})</summary>
        <div className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {SEGNAPOSTO.map(([k, d]) => <p key={k}><code className="font-bold text-violet-800">{`{${k}}`}</code> <span className="text-neutral-600">{d}</span></p>)}
        </div>
        <p className="mt-2 text-xs text-neutral-500">Se un dato manca (es. il cliente non ha lasciato il telefono), il paragrafo fatto solo di quel segnaposto sparisce da solo. Il link per disiscriversi in fondo alle email ai clienti c&apos;è sempre.</p>
      </details>

      {gruppi.map(([titolo, elenco]) => (
        <section key={titolo} className="card-fase" style={{ ["--fase" as string]: titolo.startsWith("📨") ? "#ea580c" : "#334155" }}>
          <h2>{titolo}</h2>
          <div className="mt-3 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
            {elenco.map(({ m, v }) => {
              const chiave = chiaveTesto(m, v);
              const pers = testi.get(chiave);
              const std = testoStandard(m, v);
              const dati = m === "sales-letter-1" ? { ...ESEMPIO, marchio: ({ SOLARIS: "Solaris", PURAFONTE: "Purafonte" } as Record<string, string>)[v ?? ""] ?? "P&C" } : ESEMPIO;
              const valori = valoriSegnaposto(dati, { lead: "https://crm-gruppo-pc.vercel.app/lead?id=…" }, m === "sales-letter-1" ? undefined : v);
              const dove = dovePart(m);
              return (
                <details key={chiave} id={chiave} open={p.aperta === chiave} className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-neutral-50">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-neutral-400 transition-transform group-open:rotate-90">▶</span>
                      <b className="text-neutral-900">{NOMI_EMAIL[m] ?? m}</b>
                      {v && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">{NOMI_VARIANTI[v] ?? v}</span>}
                    </span>
                    {pers
                      ? <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800" title={pers.aggiornatoIl ? `modificata il ${new Date(pers.aggiornatoIl).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}` : undefined}>✏️ personalizzata{pers.aggiornatoDa ? ` da ${pers.aggiornatoDa}` : ""}</span>
                      : <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-500">testo standard</span>}
                  </summary>
                  <div className="bg-neutral-50/60 px-4 pb-4 pt-2">
                    {dove.length > 0 && <p className="mb-2 text-xs text-neutral-600">Parte nel percorso: {dove.join(" · ")}</p>}
                    <EditorEmail modello={m} variante={v} oggetto={pers?.oggetto ?? std.oggetto} testo={pers?.testo ?? std.testo} preheader={pers?.preheader ?? ""} valori={valori}
                      salva={salvaTestoEmail} ripristina={ripristinaTestoEmail} personalizzata={!!pers} />
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
