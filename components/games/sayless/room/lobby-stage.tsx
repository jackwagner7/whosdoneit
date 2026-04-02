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
  return (
    <StageShell>
      <StageHeader
        description={!canStart ? "Need at least 1 player in every team to start." : undefined}
        title="Lobby"
        trackingItems={[{ label: "Players", value: `${players.length}` }]}
      />

      <div className="sayless-team-grid mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
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
                  <p className="sayless-team-title">Team {teamIndex + 1}</p>
                  <p className="sayless-team-name">{teamNames[teamIndex] ?? `Team ${teamIndex + 1}`}</p>
                  <p className="sayless-team-color">{team.name}</p>
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

      {isHost ? (
        <StageFooter>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-bold disabled:opacity-50 sm:text-lg"
              disabled={busy}
              onClick={() => void onShuffle()}
              type="button"
            >
              Shuffle teams
            </button>
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
        <StageFooterMessage className="text-sm font-semibold text-slate-500">
          Waiting for host to start.
        </StageFooterMessage>
      )}
    </StageShell>
  );
}
