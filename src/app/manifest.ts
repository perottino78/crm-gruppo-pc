import type { MetadataRoute } from "next";
import { NOME_APP, MOTTO, ARANCIO } from "@/lib/marchio";

// Sul telefono «Aggiungi alla schermata Home» installa P&C ONE come un'app (icona, nome, schermo intero).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${NOME_APP} — Gruppo P&C`,
    short_name: NOME_APP,
    description: MOTTO,
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: ARANCIO,
    lang: "it",
    icons: [
      { src: "/icone/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
