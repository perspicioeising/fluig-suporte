/**
 * Importação da documentação oficial do Fluig para o catálogo.
 *
 * Uso:
 *   npm run ingest -- --source=rest-new|rest-old|sdk|tdn|help|topics|all [--dry-run] [--limit=N] [--dir=documentos]
 *
 * --dry-run  baixa e interpreta, mas NÃO grava no banco.
 * --limit=N  (rest-old, sdk) processa só os N primeiros itens.
 * --dir=PATH (tdn) pasta com as páginas do TDN salvas manualmente.
 */
import { backfillTopics, ensureSource, getAdminClient, persistDocuments, persistSource } from "./lib/db";
import type { ParseResult } from "./lib/types";
import { HELP_SOURCE, ingestHelp } from "./help";
import { ingestRestNew, REST_NEW_SOURCE_SLUG } from "./rest-new";
import { ingestRestOld, REST_OLD_SOURCE_SLUG } from "./rest-old";
import { ingestSdk, SDK_SOURCE } from "./sdk-javadoc";
import { ingestTdnLocal, SOAP_SOURCE_SLUG } from "./tdn-local";

type Job = {
  key: string;
  label: string;
  /** Fonte dona das entradas (catalog_entries) geradas pelo job. */
  sourceSlug: string;
  run: () => Promise<ParseResult>;
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const [k, ...rest] = arg.replace(/^--/, "").split("=");
    args.set(k, rest.length ? rest.join("=") : "true");
  }
  return {
    source: args.get("source") ?? "all",
    dryRun: args.get("dry-run") === "true",
    limit: args.has("limit") ? Number(args.get("limit")) : undefined,
    dir: args.get("dir") ?? "documentos",
  };
}

async function main() {
  const { source, dryRun, limit, dir } = parseArgs(process.argv.slice(2));

  const jobs: Job[] = [
    { key: "rest-new", label: "REST novo (api.fluig.com/latest)", sourceSlug: REST_NEW_SOURCE_SLUG, run: ingestRestNew },
    { key: "rest-old", label: "REST antigo (api.fluig.com/old)", sourceSlug: REST_OLD_SOURCE_SLUG, run: () => ingestRestOld(limit) },
    { key: "sdk", label: "SDK (Javadoc em api.fluig.com/old/sdk)", sourceSlug: SDK_SOURCE.slug, run: () => ingestSdk(limit) },
    { key: "help", label: "Guia de uso do aplicativo (src/modules/help)", sourceSlug: HELP_SOURCE.slug, run: async () => ingestHelp() },
    { key: "tdn", label: `SOAP e documentação conceitual (TDN salvo em ${dir})`, sourceSlug: SOAP_SOURCE_SLUG, run: async () => ingestTdnLocal(dir) },
  ];

  if (source === "topics") {
    const n = await backfillTopics(getAdminClient());
    console.log(`Assuntos recalculados em ${n} entradas.`);
    return;
  }
  const selected = jobs.filter((j) => source === "all" || j.key === source);
  if (selected.length === 0) {
    throw new Error(`Fonte desconhecida: "${source}". Use rest-new, rest-old, sdk, tdn, help ou all.`);
  }

  const db = dryRun ? null : getAdminClient();
  if (dryRun) console.log("Modo dry-run: nada será gravado.\n");

  for (const job of selected) {
    console.log(`\n== ${job.label}`);
    const { entries, warnings, sources = [], documents = [] } = await job.run();

    const params = entries.reduce((n, e) => n + e.parameters.length, 0);
    const withExamples = entries.filter((e) => e.examples.length > 0).length;
    const docChunks = documents.reduce((n, d) => n + d.chunks.length, 0);
    console.log(
      `Interpretado: ${entries.length} entradas, ${params} parâmetros, ${withExamples} com exemplos; ` +
        `${documents.length} documentos conceituais (${docChunks} trechos).`,
    );

    if (db) {
      for (const s of sources) await ensureSource(db, s);

      if (entries.length > 0) {
        const stats = await persistSource(
          db,
          job.sourceSlug,
          entries,
          documents.map((d) => d.url),
        );
        console.log(
          `Gravado: ${stats.entries} entradas, ${stats.parameters} parâmetros, ` +
            `${stats.documents} documentos, ${stats.chunks} trechos; ${stats.removedEntries} obsoletas removidas.`,
        );
      } else if (documents.length === 0) {
        console.log("Nada a gravar (fonte preservada).");
      }

      if (documents.length > 0) {
        const stats = await persistDocuments(db, documents);
        console.log(`Gravado (conceitual): ${stats.documents} documentos, ${stats.chunks} trechos.`);
      }
    }

    if (warnings.length > 0) {
      console.log(`\nAvisos (${warnings.length}):`);
      for (const w of warnings.slice(0, 25)) console.log(`  - ${w}`);
      if (warnings.length > 25) console.log(`  ... e mais ${warnings.length - 25}`);
    }
  }
}

main().catch((error) => {
  console.error(`\nFalha: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
