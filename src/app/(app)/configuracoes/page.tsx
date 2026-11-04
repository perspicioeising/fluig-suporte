import { Suspense } from "react";
import type { Metadata } from "next";
import { listEnvironments } from "@/modules/environments/queries";
import {
  CreateEnvironmentForm,
  EnvironmentCard,
} from "@/modules/environments/components/environment-forms";

export const metadata: Metadata = { title: "Configurações" };

export default function SettingsPage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted">
          Ambientes Fluig e credenciais. As credenciais são cifradas no servidor
          e nunca voltam para o navegador.
        </p>
      </div>

      <CreateEnvironmentForm />

      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted">
            Carregando ambientes...
          </p>
        }
      >
        <EnvironmentList />
      </Suspense>
    </section>
  );
}

async function EnvironmentList() {
  const environments = await listEnvironments();

  if (environments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted">
        Nenhum ambiente cadastrado ainda.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {environments.map((env) => (
        <EnvironmentCard key={env.id} env={env} />
      ))}
    </div>
  );
}
