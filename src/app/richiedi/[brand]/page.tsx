export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { BRANDS } from "@/lib/brands";
import { registraLead, slugBrand } from "@/lib/leadIngest";

const MESSAGGI: Record<string, { titolo: string; sotto: string }> = {
  "pc": { titolo: "Serramenti, pergole e tende su misura", sotto: "Richiedi un sopralluogo e un preventivo gratuito: ti richiamiamo entro poche ore." },
  "solaris": { titolo: "Fotovoltaico e pompe di calore", sotto: "Scopri quanto puoi risparmiare in bolletta: analisi e preventivo gratuiti." },
  "purafonte": { titolo: "Acqua depurata a casa tua", sotto: "Prenota una prova gratuita del depuratore: ti richiamiamo per un appuntamento." },
  "work-services": { titolo: "Richiedi un contatto", sotto: "Lasciaci i tuoi dati: ti richiamiamo al più presto." },
};

export default async function Pagina({
  params,
  searchParams,
}: {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const { brand: slug } = await params;
  const sp = await searchParams;
  const b = BRANDS.find((x) => slugBrand(x.nome) === slug);
  if (!b) notFound();
  const m = MESSAGGI[slug] ?? MESSAGGI["work-services"];
  const inviato = sp.grazie === "1";
  const fonte = (typeof sp.utm_source === "string" && sp.utm_source) || (typeof sp.fonte === "string" && sp.fonte) || "facebook";
  const campagna = (typeof sp.utm_campaign === "string" && sp.utm_campaign) || "";

  async function invia(fd: FormData) {
    "use server";
    // honeypot anti-spam
    if (String(fd.get("sito") ?? "")) redirect(`/richiedi/${slug}?grazie=1`);
    if (fd.get("privacy") !== "on") redirect(`/richiedi/${slug}?errore=privacy`);
    const nome = String(fd.get("nome") ?? "");
    const tel = String(fd.get("telefono") ?? "");
    const email = String(fd.get("email") ?? "");
    const r = await registraLead({
      nome,
      telefono: tel,
      email,
      brand: b!.nome,
      fonte: String(fd.get("fonte") ?? "facebook"),
      note: [String(fd.get("interesse") ?? ""), String(fd.get("campagna") ?? "") && `Campagna: ${fd.get("campagna")}`, String(fd.get("messaggio") ?? "")]
        .filter(Boolean)
        .join(" · "),
    });
    if (!r) redirect(`/richiedi/${slug}?errore=dati`);
    redirect(`/richiedi/${slug}?grazie=1`);
  }

  const campo = "w-full border-2 border-neutral-200 rounded-lg px-3 py-3 text-base focus:outline-none focus:border-[var(--c)]";
  return (
    <main className="min-h-screen flex items-start justify-center p-4" style={{ background: b.primarySoft, ["--c" as string]: b.primary }}>
      <div className="w-full max-w-md mt-4">
        <div className="text-center mb-4">
          {b.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoUrl} alt={b.nome} className="h-14 mx-auto mb-3 object-contain" />
          ) : (
            <div className="text-2xl font-extrabold mb-2" style={{ color: b.primary }}>{b.nome}</div>
          )}
          <h1 className="text-2xl font-extrabold text-neutral-900 leading-tight">{m.titolo}</h1>
          <p className="text-neutral-700 mt-2 text-sm">{m.sotto}</p>
        </div>

        {inviato ? (
          <div className="bg-white rounded-2xl shadow-lg p-6 text-center border-t-4" style={{ borderColor: b.primary }}>
            <div className="text-4xl mb-2">✅</div>
            <h2 className="text-xl font-bold text-neutral-900">Richiesta ricevuta!</h2>
            <p className="text-neutral-700 text-sm mt-2">Grazie, ti contatteremo al più presto al numero indicato.</p>
          </div>
        ) : (
          <form action={invia} className="bg-white rounded-2xl shadow-lg p-5 space-y-3 border-t-4" style={{ borderColor: b.primary }}>
            {sp.errore === "dati" && <p className="text-sm text-red-700 bg-red-50 rounded p-2">Inserisci nome e almeno telefono o email.</p>}
            {sp.errore === "privacy" && <p className="text-sm text-red-700 bg-red-50 rounded p-2">Per procedere devi accettare l&apos;informativa privacy.</p>}
            <input name="nome" required placeholder="Nome e cognome *" className={campo} autoComplete="name" />
            <input name="telefono" type="tel" required placeholder="Telefono *" className={campo} autoComplete="tel" />
            <input name="email" type="email" placeholder="Email (facoltativa)" className={campo} autoComplete="email" />
            <input name="interesse" placeholder="Di cosa hai bisogno? (es. finestre, pergola…)" className={campo} />
            <textarea name="messaggio" rows={2} placeholder="Messaggio (facoltativo)" className={campo} />
            <input name="sito" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
            <input type="hidden" name="fonte" value={fonte} />
            <input type="hidden" name="campagna" value={campagna} />
            <label className="flex gap-2 text-xs text-neutral-600 items-start">
              <input type="checkbox" name="privacy" className="mt-0.5" />
              <span>Acconsento al trattamento dei miei dati per essere ricontattato, ai sensi del Reg. UE 2016/679 (GDPR).</span>
            </label>
            <button
              className="w-full text-white font-extrabold text-lg rounded-xl py-3.5"
              style={{ background: b.primary, boxShadow: `0 5px 0 ${b.accent}`, border: `2px solid ${b.accent}` }}
            >
              Richiedi il preventivo gratuito
            </button>
            <p className="text-center text-[11px] text-neutral-500">Nessun impegno · Risposta rapida</p>
          </form>
        )}
      </div>
    </main>
  );
}
