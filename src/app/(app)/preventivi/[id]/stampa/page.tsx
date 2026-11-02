export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { scopePreventivoWhere } from "@/lib/scope";
import StampaOfferta from "@/components/preventivi/StampaOfferta";

export default async function StampaPreventivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utenteCorrente = await getCurrentUser();
  if (!utenteCorrente) notFound();
  return <StampaOfferta id={id} scope={scopePreventivoWhere(utenteCorrente)} />;
}
