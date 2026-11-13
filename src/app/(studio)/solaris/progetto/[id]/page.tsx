import { redirect } from "next/navigation";
import { getCurrentUser, getSolarisLivello } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SolarisStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/api/esci");

  const { id } = await params;

  const progetto = await prisma.solarisProgetto.findUnique({
    where: { id },
    select: { id: true, commercialeId: true, preventivoId: true },
  });

  if (!progetto) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif" }}>
        <p>Progetto non trovato.</p>
      </div>
    );
  }

  // stesse regole del contenuto dello Studio: amministratore e tecnico Solaris vedono tutti i progetti, il commerciale i suoi
  const livello = getSolarisLivello(utente);
  if (!livello || (livello === "COMMERCIALE" && progetto.commercialeId !== utente.id)) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif" }}>
        <p>Non autorizzato.</p>
      </div>
    );
  }

  return (
    <iframe
      src={`/api/solaris/studio/${id}`}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
      }}
      title="Solaris Studio"
      allow="geolocation"
    />
  );
}
