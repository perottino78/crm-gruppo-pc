"use client";

import { useEffect } from "react";

/** I collegamenti con #ancora (es. #rilievo, #evasione) aprono la sezione a scomparsa che contiene il punto indicato. */
export default function ApriDaAncora() {
  useEffect(() => {
    const apri = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      let n: HTMLElement | null = el;
      while (n) { if (n instanceof HTMLDetailsElement) n.open = true; n = n.parentElement; }
      if (el) setTimeout(() => el.scrollIntoView({ block: "start" }), 50);
    };
    apri();
    window.addEventListener("hashchange", apri);
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href^='#']") as HTMLAnchorElement | null;
      if (a) setTimeout(apri, 0);
    };
    document.addEventListener("click", click);
    return () => { window.removeEventListener("hashchange", apri); document.removeEventListener("click", click); };
  }, []);
  return null;
}
