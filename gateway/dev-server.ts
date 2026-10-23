// Esecuzione locale degli stessi handler di produzione (test end-to-end e sviluppo).
import { createServer, type Server } from "node:http";
import { health, replay, requeue, status, tick, webhookGET, webhookPOST, type Factory } from "./lib/handlers";

export function startGateway(make: Factory, port = 0): Promise<{ server: Server; url: string }> {
  const routes: Record<string, Record<string, (r: Request) => Promise<Response> | Response>> = {
    "/api/meta/webhook": { GET: webhookGET(make), POST: webhookPOST(make) },
    "/api/internal/tick": { GET: tick(make), POST: tick(make) },
    "/api/internal/requeue": { POST: requeue(make) },
    "/api/internal/replay": { POST: replay(make) },
    "/api/internal/status": { GET: status(make), POST: status(make) },
    "/api/health": { GET: health },
  };
  const server = createServer(async (req, res) => {
    const base = `http://${req.headers.host}`;
    const u = new URL(req.url ?? "/", base);
    const h = routes[u.pathname]?.[req.method ?? "GET"];
    if (!h) { res.statusCode = 404; res.end(); return; }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(u, { method: req.method, headers: req.headers as Record<string, string>, body: req.method === "GET" || req.method === "HEAD" ? undefined : body });
    const out = await h(request);
    res.statusCode = out.status;
    out.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` })));
}

if (process.argv[1]?.endsWith("dev-server.ts")) {
  void import("./lib/runtime").then(({ makeDeps }) =>
    startGateway(makeDeps, Number(process.env.PORT ?? 3100)).then(({ url }) => console.log(`gateway locale su ${url}`)),
  );
}
