// Logo di P&C ONE: il simbolo di accensione (un "1" dentro un cerchio) su tessera arancio, più la scritta.
// Componente senza stato: va bene nelle pagine server e nei componenti client.
import { ARANCIO, ARANCIO_SCURO } from "@/lib/marchio";

export function IconaOne({ size = 40, className = "" }: { size?: number; className?: string }) {
  // lo sfondo sfumato è fatto con il CSS (niente id nell'SVG: più loghi nella stessa pagina non si disturbano)
  return (
    <span className={`inline-flex items-center justify-center ${className}`} role="img" aria-label="P&C ONE"
      style={{ width: size, height: size, borderRadius: size * 0.234, background: `linear-gradient(135deg, ${ARANCIO}, ${ARANCIO_SCURO})` }}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        {/* cerchio aperto in alto + barra: il pulsante di accensione, che è anche un "1" */}
        <path d="M22.5 20.5 A16 16 0 1 0 41.5 20.5" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" />
        <path d="M32 13 V33" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function LogoOne({ size = 40, motto, chiaro = false }: { size?: number; motto?: string | null; chiaro?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <IconaOne size={size} className="shrink-0 drop-shadow-sm" />
      <span className="leading-none">
        <span className={`block font-black tracking-tight ${chiaro ? "text-white" : "text-neutral-900"}`} style={{ fontSize: size * 0.5 }}>
          P&amp;C <span style={{ color: ARANCIO }}>ONE</span>
        </span>
        {motto && <span className={`mt-1 block text-[11px] font-medium ${chiaro ? "text-white/80" : "text-neutral-600"}`}>{motto}</span>}
      </span>
    </span>
  );
}
