"use client";

import { useCallback, useState } from "react";
import type { BodyType, ExecuteResponse, HttpMethod, KeyValue } from "./schemas";

export type ExecuteArgs = {
  environmentId: string;
  method: HttpMethod;
  path: string;
  query: KeyValue[];
  headers: KeyValue[];
  bodyType: BodyType;
  body: string;
};

/**
 * Executa uma requisição no API Tester (rota /api/tester/execute).
 * Compartilhado entre a tela do Tester e o painel embutido no catálogo,
 * para o comportamento (erros, sessão expirada) ser idêntico nos dois lugares.
 */
export function useExecuteRequest(onDone?: () => void) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ExecuteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (args: ExecuteArgs) => {
      setLoading(true);
      setError(null);
      setResponse(null);
      try {
        const res = await fetch("/api/tester/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            environmentId: args.environmentId,
            method: args.method,
            path: args.path.trim() || "/",
            query: args.query,
            headers: args.headers,
            bodyType: args.bodyType,
            body: args.bodyType === "none" ? undefined : args.body,
          }),
        });

        const type = res.headers.get("content-type") ?? "";
        if (res.redirected || !type.includes("application/json")) {
          setError("Sessão expirada. Recarregue a página e entre novamente.");
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Não foi possível executar a requisição.");
          return;
        }
        setResponse(data as ExecuteResponse);
        onDone?.();
      } catch {
        setError("Falha de comunicação com o servidor.");
      } finally {
        setLoading(false);
      }
    },
    [onDone],
  );

  const reset = useCallback(() => {
    setResponse(null);
    setError(null);
  }, []);

  return { loading, response, error, execute, reset };
}
