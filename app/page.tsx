import Link from "next/link";
import { AppBanner } from "@/components/app-banner";
import { GAME_CATALOG } from "@/lib/game-catalog";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-config";

export default function Home() {
  return (
    <main className="app-page">
      <div className="app-page-card app-page-card-mobile-fill flex flex-col">
        <AppBanner label={SITE_NAME} />

        <div className="flex flex-1 flex-col gap-6 pt-6">
          <section className="grid gap-3">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                Create Room
              </p>
              <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
                Pick a game, open a room, start fast.
              </h1>
              <p className="mt-2 text-sm font-medium text-slate-600 sm:text-base">
                {SITE_TAGLINE}
              </p>
            </div>

            <div className="grid gap-3">
              {GAME_CATALOG.map((game) => (
                <Link
                  className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-transform duration-150 hover:-translate-y-0.5"
                  href={game.createPath}
                  key={game.slug}
                >
                  <div
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${game.accentClassName}`}
                  >
                    {game.shortName}
                  </div>
                  <p className="mt-3 text-2xl font-black tracking-tight">{game.name}</p>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    {game.description}
                  </p>
                  <p className="mt-4 text-sm font-black uppercase tracking-[0.14em] text-slate-500">
                    Create room
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
              Join Room
            </p>
            <p className="mt-2 text-2xl font-black tracking-tight">
              Already have a code?
            </p>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Join an existing room the same way as before.
            </p>
            <Link
              className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-center text-xl font-bold sm:text-2xl"
              href="/join"
            >
              Join
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
