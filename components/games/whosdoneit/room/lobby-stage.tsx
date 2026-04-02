"use client";

import { PlayerBox } from "@/components/player-box";
import { StageFooter, StageFooterMessage } from "@/components/stage-footer";
import { StageHeader } from "@/components/stage-header";
import { StageShell } from "@/components/stage-shell";
import type { Player } from "@/types/whosdoneit";

type LobbyStageProps = {
  players: Player[];
  busy: boolean;
  canStart: boolean;
  isHost: boolean;
  onStart: () => Promise<void>;
};

export function LobbyStage({
  players,
  busy,
  canStart,
  isHost,
  onStart,
}: LobbyStageProps) {
  return (
    <StageShell>
      <StageHeader
        description={!canStart ? "Need at least 2 players to start." : undefined}
        title="Lobby"
        trackingItems={[{ label: "Players", value: `${players.length}` }]}
      />

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <ul className="flex min-w-0 flex-wrap content-start justify-center gap-3">
          {players.map((player) => (
            <li className="flex max-w-full items-center justify-center" key={player.id}>
              <PlayerBox
                className="player-box-lobby"
                color={player.color}
                emoji={player.emoji}
                name={player.name}
              />
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <StageFooter>
          <button
            className="w-full rounded-2xl bg-black px-5 py-3 text-xl font-bold text-white disabled:opacity-50 sm:text-2xl"
            disabled={!canStart || busy}
            onClick={() => void onStart()}
            type="button"
          >
            {busy ? "..." : "Start"}
          </button>
        </StageFooter>
      ) : (
        <StageFooterMessage className="text-sm font-semibold text-slate-500">
          Waiting for host to start.
        </StageFooterMessage>
      )}
    </StageShell>
  );
}
