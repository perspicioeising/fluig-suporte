/**
 * Importação da documentação oficial do Fluig para o catálogo.
 *
 * Uso:
 *   npm run ingest -- --source=rest-new|rest-old|all [--dry-run] [--limit=N]
 *
 * --dry-run  baixa e interpreta, mas NÃO grava no banco.
 * --limit=N  (rest-old) processa só os N primeiros recursos.
 */
import { getAdminClient, persistSource } from "./lib/db";
import type { ParseResult } from "./lib/types";
import { ingestRestNew, REST_NEW_SOURCE_SLUG } from "./rest-new";
import { ingestRestOld, REST_OLD_SOURCE_SLUG } from "./rest-old";

type Job = {
  key: string;
  label: string;
  sourceSlug: string;
  run: () => Promise<ParseResult>;
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const [k, v] = arg.replace(/^--/, "").split("=");
    args.set(k, v ?? "true");
  }
  return {
    source: args.get("source") ?? "all",
    dryRun: args.get("dry-run") === "true",
    limit: args.has("limit") ? Number(args.get("limit")) : undefined,
  };
}

async function main() {
  const { source, dryRun, limit } = parseArgs(process.argv.slice(2));

  const jobs: Job[] = [
    {
      key: "rest-new",
      label: "REST novo (api.fluig.com/latest)",
      sourceSlug: REST_NEW_SOURCE_SLUG,
      run: ingestRestNew,
    },
    {
      key: "rest-old",
      label: "REST antigo (api.fluig.com/old)",
      sourceSlug: REST_OLD_SOURCE_SLUG,
      run: () => ingestRestOld(limit),
    },
  ];

  const selected = jobs.filter((j) => source === "all" || j.key === source);
  if (selected.length === 0) {
    throw new Error(`Fonte desconhecida: "${source}". Use rest-new, rest-old ou all.`);
  }

  const db = dryRun ? null : getAdminClient();
  if (dryRun) console.log("Modo dry-run: nada será gravado.\n");

  for (const job of selected) {
    console.log(`\n== ${job.label}`);
    const { entries, warnings } = await job.run();

    const params = entries.reduce((n, e) => n + e.parameters.length, 0);
    const withExamples = entries.filter((e) => e.examples.length > 0).length;
    console.log(
      `Interpretado: ${entries.length} entradas, ${params} parâmetros, ${withExamples} com exemplos.`,
    );

    if (entries.length === 0) {
      console.log("Nenhuma entrada: nada a gravar (fonte preservada).");
    } else if (db) {
      const stats = await persistSource(db, job.sourceSlug, entries);
      console.log(
        `Gravado: ${stats.entries} entradas, ${stats.parameters} parâmetros, ` +
          `${stats.documents} documentos, ${stats.chunks} trechos; ${stats.removedEntries} obsoletas removidas.`,
      );
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
