import type { Metadata } from "next";
import { ModulePlaceholder } from "@/modules/navigation/components/module-placeholder";

export const metadata: Metadata = { title: "API Tester" };

export default function Page() {
  return <ModulePlaceholder href="/tester" phase="fase 5" />;
}
