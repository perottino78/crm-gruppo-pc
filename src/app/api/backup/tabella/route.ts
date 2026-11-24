import { type NextRequest } from "next/server";
import { chiaveValida, righeTabella } from "@/lib/backup/server";
import { nomeValido } from "@/lib/backup/regole";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Backup sul NAS: una parte di una tabella, righe JSON (una per riga) compresse gzip, mandate mentre si leggono.
export async function GET(req: NextRequest) {
  if (!(await chiaveValida(req))) return new Response("chiave mancante o sbagliata\n", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const nome = sp.get("nome") ?? "";
  const parte = Number(sp.get("parte") ?? 0), parti = Number(sp.get("parti") ?? 1);
  if (!nomeValido(nome) || !Number.isInteger(parte) || !Number.isInteger(parti) || parti < 1 || parte < 0 || parte >= parti) {
    return new Response("richiesta non valida\n", { status: 400 });
  }
  const righe = righeTabella(nome, parte, parti);
  // la prima lettura prima di rispondere: una tabella sconosciuta dà 404 e non un file vuoto
  let primo: IteratorResult<string>;
  try { primo = await righe.next(); } catch (e) {
    return new Response(`${String(e instanceof Error ? e.message : e)}\n`, { status: /sconosciuta|fuori/.test(String(e)) ? 404 : 500 });
  }
  const enc = new TextEncoder();
  const testo = new ReadableStream<Uint8Array>({
    async start(c) {
      if (!primo.done) c.enqueue(enc.encode(primo.value + "\n"));
    },
    async pull(c) {
      try {
        const r = await righe.next();
        if (r.done) c.close(); else c.enqueue(enc.encode(r.value + "\n"));
      } catch (e) { c.error(e); }
    },
  });
  const gz = testo.pipeThrough(new CompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Response(gz, {
    headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="${nome}.${parte}.ndjson.gz"`, "Cache-Control": "no-store" },
  });
}
