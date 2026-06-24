export default function AuthCodeErrorPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-6 text-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-8 shadow-sm text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl text-amber-600">
          ⚠️
        </div>
        <h1 className="mb-2 text-xl font-semibold tracking-tight text-amber-900">Authentication Failed</h1>
        <p className="mb-8 text-sm text-amber-700">
          We couldn't sign you in with GitHub. The link may have expired or was invalid.
        </p>
        <a
          href="/login"
          className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
        >
          Try again
        </a>
      </div>
    </main>
  )
}
