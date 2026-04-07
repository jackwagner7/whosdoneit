"use client";

import type { CSSProperties } from "react";
import { PlayerBox } from "@/components/player-box";
import { StageFooter, StageFooterMessage } from "@/components/stage-footer";
import { StageHeader } from "@/components/stage-header";
import { StageShell } from "@/components/stage-shell";
import { SAY_LESS_TEAM_PALETTE } from "@/lib/games/sayless/game";
import type { SayLessPlayer } from "@/types/sayless";

type LobbyStageProps = {
  players: SayLessPlayer[];
  hostPlayer: SayLessPlayer | null;
  myPlayerId: string;
  teamCount: number;
  teamNames: string[];
  busy: boolean;
  canStart: boolean;
  isHost: boolean;
  onStart: () => Promise<void>;
  onShuffle: () => Promise<void>;
  onChooseTeam: (teamIndex: number) => Promise<void>;
};

export function LobbyStage({
  players,
  hostPlayer,
  myPlayerId,
  teamCount,
  teamNames,
  busy,
  canStart,
  isHost,
  onStart,
  onShuffle,
  onChooseTeam,
}: LobbyStageProps) {
  const isTeamless = teamCount < 2;

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

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex min-h-full flex-col py-4">
          {isTeamless ? (
            <div className="my-auto rounded-[2rem] border border-slate-200 bg-slate-50 px-5 py-6">
              <p className="text-center text-lg font-black text-slate-950">Teamless</p>
              <p className="mt-2 text-center text-sm font-medium leading-6 text-slate-600">
                Individual mode. Turns rotate player by player and points go to the active player.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {players.map((player) => (
                  <PlayerBox
                    className="player-box-lobby"
                    color={player.color}
                    emoji={player.emoji}
                    key={player.id}
                    name={player.name}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="sayless-team-grid my-auto">
              {Array.from({ length: teamCount }, (_, teamIndex) => {
                const team = SAY_LESS_TEAM_PALETTE[teamIndex];
                const teamPlayers = players.filter((player) => player.team_index === teamIndex);
                const isMyTeam = teamPlayers.some((player) => player.id === myPlayerId);

                return (
                  <button
                    className={`sayless-team-panel ${isMyTeam ? "sayless-team-panel-active" : ""}`}
                    disabled={busy}
                    key={team.name}
                    onClick={() => void onChooseTeam(teamIndex)}
                    style={
                      {
                        "--team-color": team.color,
                        "--team-bg": team.background,
                      } as CSSProperties
                    }
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="sayless-team-name">{teamNames[teamIndex] ?? `Team ${teamIndex + 1}`}</p>
                      </div>
                      <span className="sayless-team-count">
                        {teamPlayers.length}
                      </span>
                    </div>

                    <div className="mt-3 flex min-w-0 flex-wrap gap-3">
                      {teamPlayers.length > 0 ? (
                        teamPlayers.map((player) => (
                          <PlayerBox
                            className="player-box-lobby"
                            color={player.color}
                            emoji={player.emoji}
                            key={player.id}
                            name={player.name}
                          />
                        ))
                      ) : (
                        <p className="text-sm font-semibold text-slate-500">No players yet.</p>
                      )}
                    </div>

                    <p className="sayless-team-action mt-3">
                      {isMyTeam ? "Your team" : "Join this team"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isHost ? (
        <StageFooter>
          <div className={`grid ${isTeamless ? "grid-cols-1" : "grid-cols-2"} gap-2`}>
            {!isTeamless ? (
              <button
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-bold disabled:opacity-50 sm:text-lg"
                disabled={busy}
                onClick={() => void onShuffle()}
                type="button"
              >
                Shuffle teams
              </button>
            ) : null}
            <button
              className="rounded-2xl bg-black px-4 py-3 text-base font-bold text-white disabled:opacity-50 sm:text-lg"
              disabled={!canStart || busy}
              onClick={() => void onStart()}
              type="button"
            >
              {busy ? "..." : "Start"}
            </button>
          </div>
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
