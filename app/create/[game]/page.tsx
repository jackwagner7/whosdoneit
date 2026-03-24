import { notFound } from "next/navigation";
import { WhosDoneItCreateRoomScreen } from "@/components/games/whosdoneit/create-room-screen";
import { SayLessCreateRoomScreen } from "@/components/games/sayless/create-room-screen";
import { getGameBySlug } from "@/lib/game-catalog";

type Props = {
  params: Promise<{ game: string }>;
};

export default async function CreateGamePage({ params }: Props) {
  const { game } = await params;
  const gameEntry = getGameBySlug(game);

  if (!gameEntry) {
    notFound();
  }

  if (gameEntry.slug === "whosdoneit") {
    return <WhosDoneItCreateRoomScreen />;
  }

  if (gameEntry.slug === "sayless") {
    return <SayLessCreateRoomScreen />;
  }

  notFound();
}
