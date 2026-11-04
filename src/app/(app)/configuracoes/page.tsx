import type { Metadata } from "next";
import { ModulePlaceholder } from "@/modules/navigation/components/module-placeholder";

export const metadata: Metadata = { title: "Configurações" };

export default function Page() {
  return <ModulePlaceholder href="/configuracoes" phase="fase 5" />;
}
