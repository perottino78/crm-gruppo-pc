// Collaudo: foto del rilievo caricate una alla volta (Ugo 24/11/2026: «errore a caricare le foto del rilievo»).
// DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/rilievo-foto.collaudo.ts
import { prisma } from "../../src/lib/prisma";
import { POST } from "../../src/app/api/rilievo/[id]/foto/route";
import { NextRequest } from "next/server";
import sharp from "sharp";

if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo su database locale di prova!");
let ok = 0, ko = 0;
const verifica = (cond: unknown, nome: string, info?: unknown) => { if (cond) { ok++; console.log("  ✓", nome); } else { ko++; console.log("  ✗", nome, info ?? ""); } };
const g = globalThis as { __utente?: unknown };
const invia = async (id: string, nome: string, tipo: string, dati: Buffer) => {
  const fd = new FormData(); fd.append("file", new File([new Uint8Array(dati)], nome, { type: tipo }));
  const res = await POST(new NextRequest(`http://localhost/api/rilievo/${id}/foto`, { method: "POST", body: fd }), { params: Promise.resolve({ id }) });
  return { status: res.status, j: await res.json() as { ok: boolean; errore?: string } };
};

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "RilievoAllegato","Documento","Rilievo","Commessa","Preventivo","Cliente","Utente","Brand" CASCADE');
  const brand = await prisma.brand.create({ data: { nome: "P&C" } });
  const ugo = await prisma.utente.create({ data: { nome: "Ugo Perottino", email: "ugo@x.it", ruolo: "AMMINISTRATORE" } });
  const cli = await prisma.cliente.create({ data: { nome: "ROSSI MARIO", brandId: brand.id } });
  const prev = await prisma.preventivo.create({ data: { clienteId: cli.id, brandId: brand.id, commercialeId: ugo.id } });
  const c = await prisma.commessa.create({ data: { numero: 7, anno: 2026, preventivoId: prev.id, clienteId: cli.id, brandId: brand.id } });
  const ril = await prisma.rilievo.create({ data: { commessaId: c.id, tecnicoId: ugo.id, dataOra: new Date() } });
  g.__utente = ugo;

  console.log("Tante foto, una alla volta");
  const grande = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#3366aa" } }).jpeg({ quality: 95 }).toBuffer();
  for (let i = 1; i <= 15; i++) { const r = await invia(ril.id, `foto${i}.jpg`, "image/jpeg", grande); if (!r.j.ok) verifica(false, `foto ${i}`, r); }
  verifica((await prisma.rilievoAllegato.count({ where: { rilievoId: ril.id } })) === 15, "15 foto caricate (prima il limite era 12 e 3,4 MB in tutto)");
  const a = await prisma.rilievoAllegato.findFirstOrThrow({ where: { rilievoId: ril.id } });
  verifica(a.dataUri.startsWith("data:image/webp") && a.dataUri.length < 400_000, "ogni foto grande viene ridotta (WebP leggero)", a.dataUri.length);
  verifica((await prisma.documento.count({ where: { entita: "COMMESSA", entitaId: c.id, cartella: "Foto rilievi" } })) === 15, "copie nella cartella «Foto rilievi»");
  console.log("PDF, doppioni ed errori");
  const pdf = Buffer.from("%PDF-1.4 rilievo");
  verifica((await invia(ril.id, "rilievo.pdf", "application/pdf", pdf)).j.ok && (await prisma.documento.count({ where: { cartella: "Rilievi misura", nome: "rilievo.pdf" } })) === 1, "PDF in «Rilievi misura»");
  await invia(ril.id, "rilievo.pdf", "application/pdf", pdf);
  verifica((await prisma.documento.count({ where: { cartella: "Rilievi misura", nome: "rilievo.pdf" } })) === 1, "stesso nome: nessun doppione nella cartella");
  const exe = await invia(ril.id, "virus.exe", "application/x-msdownload", Buffer.from("MZ"));
  verifica(exe.status === 415 && /non ammesso/.test(exe.j.errore ?? ""), "tipo non ammesso: messaggio chiaro", exe);
  const enorme = await invia(ril.id, "enorme.pdf", "application/pdf", Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(4_100_000)]));
  verifica(enorme.status === 413, "oltre 4 MB: messaggio chiaro", enorme.status);
  g.__utente = null;
  verifica((await invia(ril.id, "x.jpg", "image/jpeg", grande)).status === 401, "senza sessione: rifiutato");

  console.log(`\n${ok} verifiche superate, ${ko} fallite`);
  await prisma.$disconnect();
  if (ko) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
