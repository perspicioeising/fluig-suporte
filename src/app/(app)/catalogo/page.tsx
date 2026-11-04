import { Suspense } from "react";
import type { Metadata } from "next";
import { CatalogView } from "@/modules/catalog/components/catalog-view";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "APIs Fluig" };

export default function CatalogPage({ searchParams }: PageProps<"/catalogo">) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">APIs Fluig</h1>
        <p className="text-sm text-muted">
          Catálogo de APIs REST, Webservices SOAP e métodos do SDK, com base na
          documentação oficial.
        </p>
      </div>

      <Suspense
        fallback={
          <LoadingState label="Carregando catálogo..." />
        }
      >
        <CatalogView searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
