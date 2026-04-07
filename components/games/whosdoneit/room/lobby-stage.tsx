"use client";

import { PlayerBox } from "@/components/player-box";
import { StageFooter, StageFooterButton, StageFooterMessage } from "@/components/stage-footer";
import { StageHeader } from "@/components/stage-header";
import { StageShell } from "@/components/stage-shell";
import type { Player } from "@/types/whosdoneit";

type LobbyStageProps = {
  players: Player[];
  hostPlayer: Player | null;
  busy: boolean;
  canStart: boolean;
  isHost: boolean;
  onStart: () => Promise<void>;
};

export function LobbyStage({
  players,
  hostPlayer,
  busy,
  canStart,
  isHost,
  onStart,
}: LobbyStageProps) {
  return (
    <StageShell>
      <StageHeader
        title="Lobby"
        trackingItems={[{ label: "Players", value: `${players.length}` }]}
      />
      <div className="lobby-waiting" aria-label="Waiting for players">
        <p className="lobby-waiting-title">Waiting for players</p>
        <div aria-hidden="true" className="lobby-waiting-dots">
          <span className="lobby-waiting-dot">.</span>
          <span className="lobby-waiting-dot">.</span>
          <span className="lobby-waiting-dot">.</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <div className="flex min-h-full flex-col py-4">
          <ul className="my-auto flex min-w-0 flex-wrap content-center justify-center gap-3">
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
      </div>

      {isHost ? (
        <StageFooter>
          <StageFooterButton
            className="px-5 disabled:opacity-50 sm:text-2xl"
            disabled={!canStart || busy}
            onClick={() => void onStart()}
          >
            {busy ? "..." : "Start"}
          </StageFooterButton>
        </StageFooter>
      ) : (
        <StageFooterMessage>
          {hostPlayer ? (
            <PlayerBox color={hostPlayer.color} emoji={hostPlayer.emoji} name={hostPlayer.name} />
          ) : (
            "Waiting for host to start."
          )}
        </StageFooterMessage>
      )}
    </StageShell>
  );
}
