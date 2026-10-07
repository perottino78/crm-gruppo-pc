"use client";

import { useRef, useState, useEffect } from "react";

/** Riquadro firma (touch/mouse): salva la firma come data URI PNG nel campo nascosto `name`. */
export default function FirmaCliente({ name }: { name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [valore, setValore] = useState("");
  const disegna = useRef(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * ref.current!.width, y: ((e.clientY - r.top) / r.height) * ref.current!.height };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    ref.current!.setPointerCapture(e.pointerId);
    disegna.current = true;
    const ctx = ref.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!disegna.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function up() {
    if (!disegna.current) return;
    disegna.current = false;
    setValore(ref.current!.toDataURL("image/png"));
  }
  function pulisci() {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setValore("");
  }

  return (
    <div>
      <input type="hidden" name={name} value={valore} />
      <canvas
        ref={ref}
        width={600}
        height={180}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="w-full max-w-md h-28 border border-neutral-400 rounded bg-white touch-none"
      />
      <button type="button" onClick={pulisci} className="text-xs text-neutral-700 underline">cancella firma</button>
    </div>
  );
}
