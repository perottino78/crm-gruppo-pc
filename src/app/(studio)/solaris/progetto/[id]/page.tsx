import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SolarisStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const utente = await getCurrentUser();
  if (!utente) redirect("/login");

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

  const isAdmin = utente.ruolo === "AMMINISTRATORE";
  if (!isAdmin && progetto.commercialeId !== utente.id) {
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
