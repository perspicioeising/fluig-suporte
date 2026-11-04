import { getFacets } from "../queries";
import { CatalogSearchSchema } from "../types";
import { CatalogFilters } from "./catalog-filters";
import { CatalogResults } from "./catalog-results";

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Lê e valida a URL uma única vez e distribui o estado para filtros e lista. */
export async function CatalogView({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const search = CatalogSearchSchema.parse({
    q: first(raw.q),
    kind: first(raw.kind),
    method: first(raw.method),
    topic: first(raw.topic),
    group: first(raw.group),
    page: first(raw.page),
  });

  const facets = await getFacets(search.kind);

  return (
    <>
      <CatalogFilters search={search} groups={facets.groups} topicsAvailable={facets.topicsAvailable} />
      <CatalogResults search={search} />
    </>
  );
}
