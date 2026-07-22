import Link from "next/link";
import { AlertTriangle, ArrowRight, Code2 } from "lucide-react";

export default function AuthCodeErrorPage() {
  return (
    <main className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-50 selection:bg-emerald-500/30">
      <nav className="border-b border-zinc-900 bg-zinc-950/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center bg-white">
              <Code2 className="h-5 w-5 text-zinc-950" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold tracking-tight">ContribIQ</span>
          </Link>
        </div>
      </nav>

      <section className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md border border-red-500/30 bg-zinc-950 p-8 text-center shadow-2xl shadow-black/40">
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-sm border border-red-500/30 bg-red-500/10">
            <AlertTriangle className="h-6 w-6 text-red-300" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white">Authentication failed</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            We could not complete GitHub sign-in. Please try again. If the issue continues,
            please contact admin.
          </p>

          <Link
            href="/login"
            className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-emerald-500 px-5 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
          >
            Try again
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
