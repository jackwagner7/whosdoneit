import Link from "next/link";

export default function Home() {
  return (
    <main className="app-page">
      <div className="app-page-card app-page-card-mobile-fill flex flex-col items-center justify-center gap-4">
        <h1 className="text-center text-4xl font-black tracking-tight sm:text-5xl">Who&apos;s Done It!</h1>
        <div className="mt-2 flex w-full flex-col gap-3">
          <Link
            href="/host"
            className="rounded-2xl bg-slate-900 px-5 py-3 text-center text-xl font-bold text-white sm:text-2xl"
          >
            Create
          </Link>
          <Link
            href="/join"
            className="rounded-2xl border border-slate-300 px-5 py-3 text-center text-xl font-bold sm:text-2xl"
          >
            Join
          </Link>
        </div>
      </div>
    </main>
  );
}
