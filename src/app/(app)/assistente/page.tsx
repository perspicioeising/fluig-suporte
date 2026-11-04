import type { Metadata } from "next";
import { ModulePlaceholder } from "@/modules/navigation/components/module-placeholder";

export const metadata: Metadata = { title: "Assistente IA" };

export default function Page() {
  return <ModulePlaceholder href="/assistente" phase="fase 7" />;
}
