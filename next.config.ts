import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Le foto di copertina offerta vengono caricate come data URI tramite Server
    // Action (nessuno storage esterno configurato): il default di 1MB e' troppo
    // stretto per una foto compressa lato client (~fino a 2-3MB dopo il resize).
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
