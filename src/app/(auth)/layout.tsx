import { Plug } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center gap-2">
          <Plug className="size-6 text-accent" aria-hidden />
          <span className="text-lg font-semibold">Fluig Integration Studio</span>
        </div>
        {children}
      </div>
    </main>
  );
}
