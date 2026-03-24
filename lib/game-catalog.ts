export type GameCatalogEntry = {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  createPath: string;
  joinPath: string;
  accentClassName: string;
};

export const GAME_CATALOG: GameCatalogEntry[] = [
  {
    slug: "whosdoneit",
    name: "Who's Done It!",
    shortName: "Who's Done It",
    description: "A bluff-and-confess deduction game built for quick party rounds.",
    createPath: "/create/whosdoneit",
    joinPath: "/join",
    accentClassName: "bg-black text-white",
  },
  {
    slug: "sayless",
    name: "Say Less",
    shortName: "Say Less",
    description: "A fast team-based guessing game inspired by Monikers.",
    createPath: "/create/sayless",
    joinPath: "/join",
    accentClassName: "bg-slate-900 text-white",
  },
];

export function getGameBySlug(slug: string) {
  return GAME_CATALOG.find((game) => game.slug === slug) ?? null;
}
