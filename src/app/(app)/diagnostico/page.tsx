import type { Metadata } from "next";
import { ModulePlaceholder } from "@/modules/navigation/components/module-placeholder";

export const metadata: Metadata = { title: "Diagnóstico" };

export default function Page() {
  return <ModulePlaceholder href="/diagnostico" phase="fase 9" />;
}
