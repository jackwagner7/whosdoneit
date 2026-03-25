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
    name: "🕵️Who's Done It?",
    shortName: "🕵️Who's Done It",
    description: "How well do you really know your friends?",
    createPath: "/create/whosdoneit",
    joinPath: "/join",
    accentClassName: "bg-black text-white",
  },
  {
    slug: "sayless",
    name: "😶Say Less",
    shortName: "😶Say Less",
    description: "Clues, callbacks and chaos.",
    createPath: "/create/sayless",
    joinPath: "/join",
    accentClassName: "bg-slate-900 text-white",
  },
];

export function getGameBySlug(slug: string) {
  return GAME_CATALOG.find((game) => game.slug === slug) ?? null;
}
