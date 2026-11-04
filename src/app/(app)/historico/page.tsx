import type { Metadata } from "next";
import { ModulePlaceholder } from "@/modules/navigation/components/module-placeholder";

export const metadata: Metadata = { title: "Histórico" };

export default function Page() {
  return <ModulePlaceholder href="/historico" phase="fase 10" />;
}
