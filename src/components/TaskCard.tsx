import Link from "next/link";
import { fattoTask, cambiaStatoTask, prendiInCaricoTask, segnaMailTaskInviata } from "@/app/flusso-actions";
import { STATI_TASK, STATI_CHIUSI, nomeUfficio, statoTask } from "@/lib/flusso";
import { prisma } from "@/lib/prisma";

type Task = {
  id: string; commessaId: string; faseChiave: string | null; titolo: string; descrizione: string | null; ufficio: string;
  assegnatoNome: string | null; stato: string; creatoDa: string | null; completatoIl: Date | null; completatoDaNome: string | null;
  mailA: string | null; mailOggetto: string | null; mailTesto: string | null; mailInviataIl: Date | null; createdAt: Date;
};

export default async function TaskCard({ task, pratica }: { task: Task; pratica?: { numero: string; cliente: string } }) {
  const st = statoTask(task.stato);
  const chiuso = STATI_CHIUSI.includes(task.stato);
  const fase = task.faseChiave ? await prisma.flussoFase.findUnique({ where: { chiave: task.faseChiave } }) : null;
  const prossima = fase?.prossimaChiave ? await prisma.flussoFase.findUnique({ where: { chiave: fase.prossimaChiave } }) : null;
  const dt = (d: Date) => d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const mailto = task.mailOggetto || task.mailTesto
    ? `mailto:${task.mailA ?? ""}?subject=${encodeURIComponent(task.mailOggetto ?? "")}&body=${encodeURIComponent(task.mailTesto ?? "")}`
    : null;
  return (
    <div className="bg-white rounded-lg border border-neutral-200 border-l-4 p-3 shadow-sm" style={{ borderLeftColor: st.colore }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-neutral-900">{task.titolo}</p>
          {pratica && (
            <Link href={`/commesse/${task.commessaId}`} className="text-xs font-bold text-blue-700 underline">
              Commessa {pratica.numero} · {pratica.cliente}
            </Link>
          )}
          {task.descrizione && <p className="text-xs text-neutral-700 mt-1 whitespace-pre-line">{task.descrizione}</p>}
          <p className="text-[11px] text-neutral-600 mt-1">
            Ufficio <b>{nomeUfficio(task.ufficio)}</b>
            {task.assegnatoNome && <> · in carico a <b>{task.assegnatoNome}</b></>}
            {task.creatoDa && <> · creato da {task.creatoDa}</>} · {dt(task.createdAt)}
            {task.completatoIl && <> · chiuso {dt(task.completatoIl)}{task.completatoDaNome ? ` da ${task.completatoDaNome}` : ""}</>}
          </p>
        </div>
        <span className="text-[11px] font-extrabold uppercase px-2 py-1 rounded text-white shrink-0" style={{ background: st.colore }}>{st.nome}</span>
      </div>

      {mailto && (
        <div className="mt-2 rounded border border-purple-200 bg-purple-50 px-2 py-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-purple-800">✉ Email pronta: {task.mailOggetto}</span>
          {task.mailInviataIl ? (
            <span className="text-[11px] text-green-700 font-bold">inviata {dt(task.mailInviataIl)}</span>
          ) : (
            <>
              <a href={mailto} className="btn-3d btn-3d-purple text-[11px] px-2.5 py-1">Apri email</a>
              <form action={segnaMailTaskInviata}>
                <input type="hidden" name="taskId" value={task.id} />
                <button className="btn-3d btn-3d-outline text-[11px] px-2.5 py-1">Segna inviata</button>
              </form>
            </>
          )}
          {!task.mailA && <span className="text-[11px] text-amber-700">nessun indirizzo: inseriscilo nel programma di posta</span>}
        </div>
      )}

      {!chiuso && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!task.assegnatoNome && (
            <form action={prendiInCaricoTask}>
              <input type="hidden" name="taskId" value={task.id} />
              <button className="btn-3d btn-3d-amber text-xs px-3 py-1.5">Prendi in carico</button>
            </form>
          )}
          <form action={fattoTask}>
            <input type="hidden" name="taskId" value={task.id} />
            <button className="btn-3d btn-3d-green text-xs px-4 py-1.5">
              ✔ Fatto{prossima ? ` → passa a ${nomeUfficio(prossima.ufficio)}` : fase ? " (fine flusso)" : ""}
            </button>
          </form>
          <form action={cambiaStatoTask} className="flex items-center gap-1">
            <input type="hidden" name="taskId" value={task.id} />
            <select name="stato" defaultValue={task.stato} className="border border-neutral-300 rounded px-1.5 py-1 text-xs">
              {STATI_TASK.map((s) => <option key={s.chiave} value={s.chiave}>{s.nome}</option>)}
            </select>
            <button className="btn-3d btn-3d-blue text-xs px-3 py-1.5">Cambia stato</button>
          </form>
        </div>
      )}
    </div>
  );
}
