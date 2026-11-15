export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { puo, visibilitaDi } from "@/lib/permessi/catalogo";
import { classifica, periodoDi, type Posizione } from "@/lib/kit/punti";
import { regoleKit, praticheSenzaKit, vedeSoloISuoiKit } from "@/lib/kit/server";
import { salvaRegoleKit, registraKitCliente } from "@/app/kit-cliente-actions";

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const nomeMese = (p: string) => `${MESI[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`;
const giorno = (d: Date) => d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" });
const MEDAGLIA = ["🥇", "🥈", "🥉"];
const inp = "border border-neutral-300 rounded px-2 py-1.5 text-sm";

function Classifica({ titolo, premio, righe, io }: { titolo: string; premio: string; righe: Posizione[]; io: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-neutral-900">{titolo}</h2>
        <span className="rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-900">🏆 Premio: {premio || "da annunciare"}</span>
      </div>
      {righe.length === 0 ? (
        <p className="text-sm text-neutral-600">Ancora nessun kit consegnato: il primo che lo registra va in testa.</p>
      ) : (
        <ol className="divide-y divide-neutral-100">
          {righe.map((r) => (
            <li key={r.utenteId} className={`flex items-center gap-3 py-2 ${r.utenteId === io ? "bg-pink-50 -mx-2 px-2 rounded" : ""}`}>
              <span className="w-10 text-center text-lg font-bold text-neutral-800">{MEDAGLIA[r.posizione - 1] ?? `${r.posizione}°`}</span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-neutral-900">{r.nome}{r.utenteId === io ? " (tu)" : ""}</span>
                <span className="block text-xs text-neutral-600">{r.kit} kit · {r.foto} con foto · {r.recensioni} con recensione</span>
              </span>
              <span className="text-lg font-extrabold text-pink-700">{r.punti} <span className="text-xs font-semibold">punti</span></span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default async function KitPage({ searchParams }: { searchParams: Promise<{ ok?: string; errore?: string; mese?: string }> }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const sp = await searchParams;
  const oggi = new Date();
  const meseCorrente = periodoDi(oggi, "mese");
  const mese = /^\d{4}-\d{2}$/.test(sp.mese ?? "") ? sp.mese! : meseCorrente;
  const anno = mese.slice(0, 4);
  const inizioAnno = new Date(`${anno}-01-01T00:00:00+01:00`);
  const [regole, consegne, daConsegnare] = await Promise.all([
    regoleKit(),
    prisma.consegnaKit.findMany({
      where: { consegnatoIl: { gte: new Date(inizioAnno.getTime() - 86400000), lt: new Date(`${+anno + 1}-01-02T00:00:00+01:00`) } },
      orderBy: { consegnatoIl: "desc" },
    }),
    praticheSenzaKit(u),
  ]);
  const clienti = new Map((await prisma.cliente.findMany({ where: { id: { in: consegne.slice(0, 15).map((c) => c.clienteId) } }, select: { id: true, nome: true } })).map((c) => [c.id, c.nome]));
  const kMese = classifica(consegne, mese);
  const kAnno = classifica(consegne, anno);
  const gestisce = puo(u, "kit.regole");
  const soloMiei = vedeSoloISuoiKit(u);
  const mio = kMese.find((r) => r.utenteId === u.id);
  const mesePrima = (() => { const [y, m] = mese.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; })();
  const meseDopo = (() => { const [y, m] = mese.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; })();

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">🎁 Raccolta punti: kit al cliente</h1>
        <p className="text-sm text-neutral-600">
          A lavoro finito consegna il kit P&amp;C al cliente e registralo nella pratica: <b>{regole.puntiConsegna} punti</b> a kit,
          {" "}<b>+{regole.puntiFoto}</b> con la foto della consegna, <b>+{regole.puntiRecensione}</b> se il cliente lascia la recensione.
          Chi fa più punti nel mese vince il premio.
        </p>
      </div>
      {sp.ok && <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">✅ {sp.ok}</p>}
      {sp.errore && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{sp.errore}</p>}

      {mese === meseCorrente && (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-neutral-200 border-l-4 border-l-pink-600 bg-white p-4">
            <p className="text-xs font-semibold text-neutral-600">I tuoi punti di {nomeMese(mese)}</p>
            <p className="text-3xl font-extrabold text-pink-700">{mio?.punti ?? 0}</p>
            <p className="text-xs text-neutral-600">{mio ? `${mio.posizione}° in classifica · ${mio.kit} kit` : "ancora nessun kit questo mese"}</p>
          </div>
          <div className={`rounded-lg border border-neutral-200 border-l-4 bg-white p-4 md:col-span-2 ${daConsegnare.length ? "border-l-amber-500" : "border-l-green-600"}`}>
            <p className="text-xs font-semibold text-neutral-600">{soloMiei ? "I tuoi kit da consegnare" : "Kit da consegnare"}</p>
            <p className="text-3xl font-extrabold text-neutral-900">{daConsegnare.length}</p>
            <p className="text-xs text-neutral-600">{daConsegnare.length ? `fino a ${daConsegnare.length * (regole.puntiConsegna + regole.puntiFoto + regole.puntiRecensione)} punti da prendere` : "tutti i lavori finiti hanno il loro kit"}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">
        <Link href={`/kit?mese=${mesePrima}`} className="btn-3d btn-3d-outline px-2 py-1">‹</Link>
        <span className="font-semibold text-neutral-800">{nomeMese(mese)}</span>
        {mese < meseCorrente && <Link href={`/kit?mese=${meseDopo}`} className="btn-3d btn-3d-outline px-2 py-1">›</Link>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Classifica titolo={`Classifica di ${nomeMese(mese)}`} premio={regole.premioMese} righe={kMese} io={u.id} />
        <Classifica titolo={`Classifica del ${anno}`} premio={regole.premioAnno} righe={kAnno} io={u.id} />
      </div>

      {daConsegnare.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 className="mb-2 text-base font-bold text-amber-900">📦 Lavori finiti senza kit ({daConsegnare.length})</h2>
          <div className="divide-y divide-amber-200">
            {daConsegnare.slice(0, 40).map((x) => (
              <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <Link href={`/clienti/${x.clienteId}`} className="font-semibold text-blue-800 underline decoration-blue-300 underline-offset-2">{x.cliente}</Link>
                  {x.comune ? <span className="text-neutral-600"> · {x.comune}</span> : null}
                  <span className="text-neutral-600"> · {x.numero}{!soloMiei ? ` · ${x.commerciale}` : ""}{x.dataFine ? ` · fine lavori ${giorno(x.dataFine)}` : ""}</span>
                </span>
                <span className="flex items-center gap-2">
                  <form action={registraKitCliente}>
                    <input type="hidden" name="commessaId" value={x.id} />
                    <input type="hidden" name="torna" value="kit" />
                    <button className="btn-3d btn-3d-green px-3 py-1 text-xs">✅ Kit consegnato</button>
                  </form>
                  <Link href={`/commesse/${x.id}#kit-cliente`} className="text-xs text-blue-800 underline">con foto…</Link>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-base font-bold text-neutral-900">Ultime consegne</h2>
        {consegne.length === 0 ? <p className="text-sm text-neutral-600">Nessuna consegna registrata nel {anno}.</p> : (
          <div className="divide-y divide-neutral-100">
            {consegne.slice(0, 15).map((k) => (
              <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                <span className="text-neutral-800">
                  {giorno(k.consegnatoIl)} · <b>{k.utenteNome}</b> → <Link href={`/commesse/${k.commessaId}#kit-cliente`} className="text-blue-800 underline decoration-blue-300 underline-offset-2">{clienti.get(k.clienteId) ?? "cliente"}</Link>
                  {k.conFoto ? " · 📷" : ""}{k.recensione ? " · ⭐" : ""}
                </span>
                <span className="font-bold text-pink-700">{k.punti} punti</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {gestisce && (
        <form id="regole" action={salvaRegoleKit} className="scroll-mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-1 text-base font-bold text-neutral-900">⚙️ Regole e premi</h2>
          <p className="mb-3 text-xs text-neutral-600">Valgono per i kit registrati da adesso; i punti già dati non cambiano. Solo l&apos;amministrazione vede questo riquadro.</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-neutral-700">Punti per kit<input name="puntiConsegna" type="number" min={0} max={1000} defaultValue={regole.puntiConsegna} className={`${inp} block w-28`} /></label>
            <label className="text-xs font-semibold text-neutral-700">+ con la foto<input name="puntiFoto" type="number" min={0} max={1000} defaultValue={regole.puntiFoto} className={`${inp} block w-28`} /></label>
            <label className="text-xs font-semibold text-neutral-700">+ con la recensione<input name="puntiRecensione" type="number" min={0} max={1000} defaultValue={regole.puntiRecensione} className={`${inp} block w-28`} /></label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-neutral-700">Premio del mese<input name="premioMese" defaultValue={regole.premioMese} placeholder="es. Buono carburante da 100 €" className={`${inp} block w-full`} /></label>
            <label className="text-xs font-semibold text-neutral-700">Premio dell&apos;anno<input name="premioAnno" defaultValue={regole.premioAnno} placeholder="es. Weekend per due" className={`${inp} block w-full`} /></label>
          </div>
          <button className="btn-3d btn-3d-dark mt-3 px-4 py-2 text-sm">Salva regole e premi</button>
        </form>
      )}
    </div>
  );
}
