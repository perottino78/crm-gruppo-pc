export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getCurrentUser, isAmministratore } from "@/lib/auth";
import { UFFICI, STATI_CHIUSI, nomeUfficio } from "@/lib/flusso";
import { numeroCommessa } from "@/lib/commesse";
import TaskCard from "@/components/TaskCard";
import { assicuraFlusso } from "@/app/flusso-actions";

export default async function TaskPage({ searchParams }: { searchParams: Promise<{ ufficio?: string; vista?: string }> }) {
  const sp = await searchParams;
  const u = await getCurrentUser();
  await assicuraFlusso();
  const admin = isAmministratore(u);
  const ufficio = sp.ufficio ?? (u?.ufficio && !admin ? u.ufficio : u?.ufficio ?? "TUTTI");
  const vista = sp.vista ?? "aperti";
  const tasks = await prisma.taskPratica.findMany({
    where: {
      ...(ufficio !== "TUTTI" ? { ufficio } : {}),
      ...(vista === "aperti" ? { stato: { notIn: STATI_CHIUSI } } : vista === "chiusi" ? { stato: { in: STATI_CHIUSI } } : {}),
    },
    include: { commessa: { include: { cliente: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const link = (uff: string, v: string) => `/task?ufficio=${uff}&vista=${v}`;
  const pill = (on: boolean) => `px-3 py-1.5 rounded-md text-xs font-bold border ${on ? "bg-blue-700 text-white border-blue-700" : "bg-white text-neutral-800 border-neutral-300"}`;
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-extrabold text-neutral-900 mb-1">✅ Task pratiche</h1>
      <p className="text-sm text-neutral-700 mb-4">
        Quando un ufficio preme <b>Fatto</b>, la pratica passa in automatico all&apos;ufficio successivo con il suo task già pronto.
        {u?.ufficio && <> Il tuo ufficio: <b>{nomeUfficio(u.ufficio)}</b>.</>}
      </p>
      <div className="flex flex-wrap gap-2 mb-2">
        <Link href={link("TUTTI", vista)} className={pill(ufficio === "TUTTI")}>Tutti gli uffici</Link>
        {UFFICI.map((x) => <Link key={x.chiave} href={link(x.chiave, vista)} className={pill(ufficio === x.chiave)}>{x.nome}</Link>)}
      </div>
      <div className="flex gap-2 mb-4">
        {[["aperti", "Aperti"], ["chiusi", "Chiusi"], ["tutti", "Tutti"]].map(([k, n]) => <Link key={k} href={link(ufficio, k)} className={pill(vista === k)}>{n}</Link>)}
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-neutral-600 bg-white border border-neutral-200 rounded-lg p-4">Nessun task {vista === "aperti" ? "aperto" : ""} per questa selezione.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} pratica={{ numero: numeroCommessa(t.commessa), cliente: t.commessa.cliente.nome }} />
          ))}
        </div>
      )}
    </div>
  );
}
