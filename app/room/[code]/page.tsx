import { RoomRouterClient } from "@/components/room-router-client";

type Props = {
  params: Promise<{ code: string }>;
};

export default async function RoomPage({ params }: Props) {
  const { code } = await params;
  return <RoomRouterClient code={code} />;
}
