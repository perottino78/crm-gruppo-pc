export const dynamic = "force-dynamic";

// Backup sul NAS dell'ufficio (richiesta di Ugo, nov 2026): il NAS (QNAP, rete privata) ogni notte scarica da P&C ONE una copia di tutti i dati.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { puo } from "@/lib/permessi/catalogo";
import { APP_URL } from "@/lib/mail/invio";
import { situazioneBackup } from "@/lib/backup/server";
import { formatoBytes } from "@/lib/database/consumi";
import { ChiaveBackup } from "@/components/backup/ChiaveBackup";

const CARTELLA = "Backup P&C ONE";
const quando = (s: string) => new Date(s).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const durata = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`);
const STATO = {
  ok: ["border-green-300 bg-green-50 text-green-900", "✅ Il backup funziona."],
  mai: ["border-neutral-300 bg-neutral-50 text-neutral-800", "Nessun backup ancora arrivato."],
  errori: ["border-amber-300 bg-amber-50 text-amber-900", "⚠️ L'ultimo backup ha avuto errori: guarda «ultimo.log» sul NAS."],
  fermo: ["border-red-300 bg-red-50 text-red-900", "🚨 Da più di 36 ore non arriva un backup: il NAS è acceso? L'ufficio ha internet?"],
} as const;

export default async function BackupPage() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!puo(u, "backup")) redirect("/impostazioni");
  const s = await situazioneBackup();
  const [colore, testo] = STATO[s.stato.livello];
  const cmdProva = `sh "/share/${CARTELLA}/.one/backup-one.sh" --dati; cat "/share/${CARTELLA}/.one/ultimo.log"`;

  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/impostazioni" className="btn-indietro">← Impostazioni</Link>
      <div>
        <h1 className="text-2xl font-extrabold text-neutral-900">💾 Backup sul NAS dell&apos;ufficio</h1>
        <p className="text-sm text-neutral-600">
          Ogni notte alle 2 il NAS QNAP dell&apos;ufficio scarica da P&amp;C ONE una copia dei dati e la mette nella cartella «{CARTELLA}».
          Tutti i giorni i dati (clienti, lead, offerte, pratiche, ordini, contabilità…), la domenica anche foto e documenti.
          Tiene gli ultimi 30 backup dei dati e gli ultimi 5 completi. Il NAS resta chiuso verso internet: è lui a chiamare P&amp;C ONE con una chiave segreta.
        </p>
      </div>

      {s.attivo && <p className={`rounded-lg border px-3 py-2 text-sm font-semibold ${colore}`}>{testo}{s.ultimoRiuscito && <> Ultimo riuscito: {quando(s.ultimoRiuscito)}.</>}</p>}

      {s.storico.length > 0 && (
        <section className="card-fase space-y-2" style={{ "--fase": "#0d9488" } as React.CSSProperties}>
          <h2>Ultimi backup arrivati</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-neutral-500"><th className="py-1 pr-3">Quando</th><th className="pr-3">Tipo</th><th className="pr-3">Cartella sul NAS</th><th className="pr-3 text-right">File</th><th className="pr-3 text-right">Dimensione</th><th className="pr-3 text-right">Durata</th><th>Esito</th></tr></thead>
              <tbody>
                {s.storico.map((e, i) => (
                  <tr key={i} className="border-t border-neutral-100">
                    <td className="py-1 pr-3 whitespace-nowrap">{quando(e.il)}</td>
                    <td className="pr-3">{e.tipo === "completo" ? "Completo (con foto e documenti)" : "Dati"}</td>
                    <td className="pr-3 font-mono text-xs">{e.cartella}</td>
                    <td className="pr-3 text-right">{e.file}</td>
                    <td className="pr-3 text-right whitespace-nowrap">{formatoBytes(e.byte)}</td>
                    <td className="pr-3 text-right">{durata(e.durata)}</td>
                    <td>{e.errori ? <span className="font-semibold text-red-700">{e.errori} errori</span> : <span className="text-green-700">✓</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.ultimo?.liberoKB !== undefined && <p className="text-xs text-neutral-600">Spazio libero sul NAS dopo l&apos;ultimo backup: <strong>{formatoBytes(s.ultimo.liberoKB * 1024)}</strong>.</p>}
        </section>
      )}

      <section className="card-fase space-y-3" style={{ "--fase": "#2563eb" } as React.CSSProperties}>
        <h2>{s.attivo ? "Impostazione (già fatta)" : "Impostazione (una volta sola, 5 minuti)"}</h2>
        <ol className="list-decimal space-y-3 pl-5 text-sm text-neutral-800">
          <li>
            <strong>Sul NAS, accendi SSH.</strong> Dal Mac apri il NAS nel browser (<span className="font-mono">https://192.168.1.5:5001</span>), entra con l&apos;account
            <strong> amministratore</strong> (non «pcone-backup»), poi <em>Pannello di controllo › Rete e servizi file › Telnet / SSH</em> › spunta
            «Consenti connessione SSH» (porta 22) › Applica.
          </li>
          <li>
            <strong>Crea la chiave qui sotto</strong> e copia il comando che compare.
            <div className="mt-2"><ChiaveBackup url={APP_URL} cartella={CARTELLA} attivo={s.attivo} /></div>
          </li>
          <li>
            <strong>Sul Mac apri «Terminale»</strong> (Launchpad › Altro › Terminale) e scrivi <span className="font-mono">ssh admin@192.168.1.5</span>{" "}
            (al posto di «admin» il nome dell&apos;account amministratore), Invio, la password dell&apos;amministratore (mentre la scrivi non si vede nulla: è normale), Invio.
            Se compare un menu, premi <span className="font-mono">Q</span> e poi <span className="font-mono">Y</span> per avere la riga di comando.
            Incolla il comando del passo 2 e premi Invio. Deve rispondere <strong>«FATTO: il backup partirà ogni notte alle 2:00.»</strong>
          </li>
          <li>
            <strong>Primo backup subito (facoltativo, consigliato):</strong> nello stesso Terminale incolla
            <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-neutral-100 p-2 text-xs">{cmdProva}</pre>
            Dopo qualche minuto deve finire con «Finito … 0 errori» e qui sopra compare il backup. Poi scrivi <span className="font-mono">exit</span>.
          </li>
          <li>
            <strong>Spegni di nuovo SSH</strong> (stesso punto del passo 1): l&apos;attività notturna continua a funzionare lo stesso.
          </li>
        </ol>
        <p className="text-xs text-neutral-600">
          Se un aggiornamento del NAS cancella le attività pianificate, il backup si ferma: dopo 36 ore senza backup arriva un&apos;email agli amministratori.
          Basta riaccendere SSH e rifare il passo 3 con la stessa chiave: <span className="font-mono">sh &quot;/share/{CARTELLA}/.one/backup-one.sh&quot; --installa</span>.
        </p>
      </section>

      <section className="card-fase space-y-2" style={{ "--fase": "#64748b" } as React.CSSProperties}>
        <h2>Da sapere</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
          <li>Ogni backup è una cartella con la data (es. «2026-11-25», «2026-11-29-completo»): dentro un file per tabella (<span className="font-mono">.ndjson.gz</span>) e il «registro.txt» di quella notte.</li>
          <li>La chiave è salvata sul NAS nella cartella «{CARTELLA}/.one», che vede solo chi vede già i backup. In P&amp;C ONE resta solo un&apos;impronta: chi la legge non può scaricare niente.</li>
          <li>Per rimettere i dati in un database (in caso di disastro) c&apos;è il programma <span className="font-mono">scripts/backup/ripristina.ts</span>: lo usa il tecnico, su un database nuovo.</li>
          <li>Ogni backup legge tutti i dati dal database: il traffico in più di Neon si vede in <Link href="/impostazioni/database" className="underline">Consumo del database</Link>.</li>
          <li>L&apos;account «pcone-backup» del NAS non serve per questo backup: puoi usarlo per guardare i backup dal Finder del Mac (WebDAV, sola cartella «{CARTELLA}»).</li>
        </ul>
      </section>
    </div>
  );
}
