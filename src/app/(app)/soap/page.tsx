import type { Metadata } from "next";
import { ModulePlaceholder } from "@/modules/navigation/components/module-placeholder";

export const metadata: Metadata = { title: "Webservices SOAP" };

export default function Page() {
  return <ModulePlaceholder href="/soap" phase="fase 6" />;
}
