"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnsweringStage } from "@/components/room/answering-stage";
import { FinishedStage } from "@/components/room/finished-stage";
import { GuessingStage } from "@/components/room/guessing-stage";
import { JoinInline } from "@/components/room/join-inline";
import { LeaderboardStage } from "@/components/room/leaderboard-stage";
import { LobbyStage } from "@/components/room/lobby-stage";
import { RevealingStage } from "@/components/room/revealing-stage";
import { SettingsSheet } from "@/components/room/settings-sheet";
import {
  advanceReveal,
  getGameSnapshotByCode,
  getRoundProgress,
  joinRoom,
  maybeAdvanceRoom,
  revealCurrentPlayer,
  startGame,
  startNextRound,
  submitConfession,
  submitGuess,
  submitPrompt,
  subscribeToRoom,
  updateRoomSettings,
} from "@/lib/game";
import {
  getStoredPlayerPreferences,
  setStoredPlayerPreferences,
} from "@/lib/player-preferences";
import type { GamePhase, GameSnapshot, Player } from "@/types/games";

type RoomClientProps = {
  code: string;
};

type SettingsDraft = {
  answeringSeconds: number;
  guessingSeconds: number;
  revealSeconds: number;
};

function sortLeaderboard(players: Player[]) {
  return [...players].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  );
}

function phaseSymbol(phase: GamePhase) {
  switch (phase) {
    case "lobby":
      return "?";
    case "answering":
      return "!";
    case "guessing":
      return "#";
    case "revealing":
      return "*";
    case "leaderboard":
      return "+";
    case "finished":
      return "=";
    default:
      return ".";
  }
}

export function RoomClient({ code }: RoomClientProps) {
  const normalizedCode = code.toUpperCase();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [promptText, setPromptText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [joinDefaults] = useState(() => getStoredPlayerPreferences());
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>({
    answeringSeconds: 25,
    guessingSeconds: 35,
    revealSeconds: 8,
  });

  const loadSnapshot = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) {
        setLoading(true);
      }

      try {
        const next = await getGameSnapshotByCode(normalizedCode);
        setSnapshot(next);
        setError(null);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Could not load room.";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [normalizedCode],
  );

  useEffect(() => {
    const storedPlayerId =
      localStorage.getItem(`playerId:${normalizedCode}`) ??
      localStorage.getItem("playerId");
    setPlayerId(storedPlayerId);
    void loadSnapshot(true);
  }, [loadSnapshot, normalizedCode]);

  useEffect(() => {
    if (!snapshot?.room.id) {
      return;
    }

    const unsubscribe = subscribeToRoom(snapshot.room.id, () => {
      void loadSnapshot();
    });

    return unsubscribe;
  }, [loadSnapshot, snapshot?.room.id]);

  useEffect(() => {
    if (!snapshot?.room.id) {
      return;
    }

    if (
      snapshot.room.phase !== "answering" &&
      snapshot.room.phase !== "guessing" &&
      snapshot.room.phase !== "revealing"
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void maybeAdvanceRoom(snapshot.room.id)
        .then(() => loadSnapshot())
        .catch(() => undefined);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [loadSnapshot, snapshot?.room.id, snapshot?.room.phase]);

  const me = useMemo(() => {
    if (!snapshot || !playerId) {
      return null;
    }

    return snapshot.players.find((player) => player.id === playerId) ?? null;
  }, [playerId, snapshot]);

  useEffect(() => {
    if (!snapshot || !me) {
      return;
    }

    localStorage.setItem("playerId", me.id);
    localStorage.setItem(`playerId:${snapshot.room.code}`, me.id);
    setStoredPlayerPreferences({ name: me.name, color: me.color, emoji: me.emoji });
  }, [me, snapshot]);

  const myPrompt = useMemo(() => {
    if (!snapshot || !me) {
      return null;
    }

    return snapshot.prompts.find(
      (prompt) => prompt.submitted_by_player_id === me.id,
    );
  }, [me, snapshot]);

  useEffect(() => {
    if (myPrompt && !promptText) {
      setPromptText(myPrompt.text);
    }
  }, [myPrompt, promptText]);

  const round = useMemo(
    () => (snapshot ? getRoundProgress(snapshot) : null),
    [snapshot],
  );
  const leaderboard = useMemo(
    () => (snapshot ? sortLeaderboard(snapshot.players) : []),
    [snapshot],
  );

  const runAction = useCallback(
    async (actionKey: string, fn: () => Promise<void>) => {
      setBusyAction(actionKey);
      setActionError(null);

      try {
        await fn();
        await loadSnapshot();
      } catch (actionIssue) {
        const message =
          actionIssue instanceof Error
            ? actionIssue.message
            : "Action failed. Please retry.";
        setActionError(message);
      } finally {
        setBusyAction(null);
      }
    },
    [loadSnapshot],
  );

  const handleInlineJoin = useCallback(
    async (name: string, color: string, emoji: string) => {
      setJoinLoading(true);
      setJoinError(null);

      try {
        const { room, player } = await joinRoom(normalizedCode, name, color, emoji);
        setStoredPlayerPreferences({
          name: player.name,
          color: player.color,
          emoji: player.emoji,
        });
        localStorage.setItem("playerId", player.id);
        localStorage.setItem(`playerId:${room.code}`, player.id);
        setPlayerId(player.id);
        await loadSnapshot();
      } catch (joinIssue) {
        setJoinError(joinIssue instanceof Error ? joinIssue.message : "Join failed.");
      } finally {
        setJoinLoading(false);
      }
    },
    [loadSnapshot, normalizedCode],
  );

  const handleSaveSettings = useCallback(
    async (settings: {
      answeringSeconds: number;
      guessingSeconds: number;
      revealSeconds: number;
    }) => {
      if (!snapshot || !me || !me.is_host) {
        return;
      }

      setSettingsSaving(true);
      setActionError(null);
      try {
        await updateRoomSettings(snapshot.room.id, me.id, settings);
        setSettingsOpen(false);
        await loadSnapshot();
      } catch (issue) {
        setActionError(issue instanceof Error ? issue.message : "Settings failed.");
      } finally {
        setSettingsSaving(false);
      }
    },
    [loadSnapshot, me, snapshot],
  );

  if (loading) {
    return (
      <main className="app-page">
        <div className="app-page-card app-page-card-wide app-page-card-mobile-fill">
          Loading...
        </div>
      </main>
    );
  }

  if (error || !snapshot) {
    return (
      <main className="app-page">
        <div className="app-page-card app-page-card-wide app-page-card-mobile-fill">
          <p className="text-xl font-bold">Room unavailable</p>
          <p className="mt-2 text-sm text-slate-600">{error ?? "Unknown error."}</p>
        </div>
      </main>
    );
  }

  if (!playerId || !me) {
    return (
      <main className="app-page pb-28">
        <div className="app-page-card app-page-card-wide app-page-card-mobile-fill">
          <JoinInline
            code={snapshot.room.code}
            defaultColor={joinDefaults.color}
            defaultEmoji={joinDefaults.emoji}
            defaultName={joinDefaults.name}
            error={joinError}
            loading={joinLoading}
            onJoin={handleInlineJoin}
            takenColors={snapshot.players.map((player) => player.color)}
          />
        </div>
      </main>
    );
  }

  const submittedPromptCount = snapshot.prompts.length;
  const canStart =
    snapshot.players.length >= 3 &&
    snapshot.players.length <= 10 &&
    submittedPromptCount === snapshot.players.length;

  const currentPrompt = round?.currentPrompt ?? null;
  const confessions = round?.confessions ?? [];
  const guesses = round?.guesses ?? [];
  const sortedPlayers = round?.players ?? snapshot.players;
  const myConfession = confessions.find((entry) => entry.player_id === me.id);

  const myGuessRows = guesses.filter((entry) => entry.guessing_player_id === me.id);
  const myGuessByTarget = new Map(
    myGuessRows.map((entry) => [entry.target_player_id, entry.guessed_answer]),
  );
  const myGuessSignature = myGuessRows
    .map((entry) => `${entry.target_player_id}:${entry.guessed_answer ? "1" : "0"}`)
    .sort()
    .join("|");

  const revealTarget =
    snapshot.room.phase === "revealing"
      ? sortedPlayers[snapshot.room.reveal_player_index] ?? null
      : null;
  const truth = revealTarget
    ? confessions.find((entry) => entry.player_id === revealTarget.id)?.answer
    : undefined;
  const canRevealControl = Boolean(revealTarget && revealTarget.id === me.id);
  const playersById = new Map(snapshot.players.map((player) => [player.id, player]));
  const revealGuessRows = (guesses ?? [])
    .filter((entry) => entry.target_player_id === revealTarget?.id)
    .sort((left, right) => {
      const leftName = playersById.get(left.guessing_player_id)?.name ?? "";
      const rightName = playersById.get(right.guessing_player_id)?.name ?? "";
      return leftName.localeCompare(rightName);
    })
    .map((entry) => ({
      id: entry.id,
      guesserName: playersById.get(entry.guessing_player_id)?.name ?? "Unknown",
      guesserColor: playersById.get(entry.guessing_player_id)?.color ?? "#475569",
      guesserEmoji: playersById.get(entry.guessing_player_id)?.emoji ?? "🙂",
      guessedAnswer: entry.guessed_answer,
      correct: typeof truth === "boolean" && entry.guessed_answer === truth,
    }));

  const hasNextRound =
    snapshot.room.current_prompt_index + 1 < Math.max(snapshot.prompts.length, 1);

  return (
    <main className="app-page pb-28">
      <div className="app-page-card app-page-card-wide app-page-card-mobile-fill">
        <div className="flex flex-col gap-3">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black tracking-[0.2em]">
              {phaseSymbol(snapshot.room.phase)} {snapshot.room.code}
            </p>
            {me.is_host ? (
              <button
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold"
                onClick={() => {
                  setSettingsDraft({
                    answeringSeconds: snapshot.room.answering_seconds,
                    guessingSeconds: snapshot.room.guessing_seconds,
                    revealSeconds: snapshot.room.reveal_seconds,
                  });
                  setSettingsOpen(true);
                }}
                type="button"
              >
                Timers
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-lg font-bold" style={{ color: me.color }}>
            {me.name} {me.emoji}
          </p>
          <p className="text-sm text-slate-600">
            {snapshot.room.current_prompt_index + 1}/{Math.max(snapshot.prompts.length, 1)} |{" "}
            {snapshot.players.length} players
          </p>
          {actionError ? (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {actionError}
            </p>
          ) : null}
          </section>

          {snapshot.room.phase === "lobby" ? (
            <LobbyStage
              busy={Boolean(busyAction)}
              canStart={canStart}
              onPromptTextChange={setPromptText}
              onStart={() =>
                runAction("start", async () => {
                  await startGame(snapshot.room.id);
                })
              }
              onSubmitPrompt={() =>
                runAction("prompt", async () => {
                  await submitPrompt(snapshot.room.id, me.id, promptText);
                })
              }
              playerCount={snapshot.players.length}
              promptReady={Boolean(myPrompt)}
              promptText={promptText}
              submittedPromptCount={submittedPromptCount}
            />
          ) : null}

          {snapshot.room.phase === "answering" && currentPrompt ? (
            <AnsweringStage
              answer={myConfession?.answer}
              busy={Boolean(busyAction)}
              confessionCount={round?.confessionCount ?? 0}
              deadlineAt={snapshot.room.phase_deadline_at}
              expectedConfessions={round?.expectedConfessions ?? 0}
              onSubmit={(value) =>
                runAction("answer", async () => {
                  await submitConfession(snapshot.room.id, currentPrompt.id, me.id, value);
                  await maybeAdvanceRoom(snapshot.room.id);
                })
              }
              prompt={currentPrompt.text}
            />
          ) : null}

          {snapshot.room.phase === "guessing" && currentPrompt ? (
            <GuessingStage
              key={`${currentPrompt.id}:${myGuessSignature}`}
              busy={Boolean(busyAction)}
              deadlineAt={snapshot.room.phase_deadline_at}
              expectedGuesses={round?.expectedGuesses ?? 0}
              expectedMyGuessCount={Math.max(snapshot.players.length - 1, 0)}
              guessCount={round?.guessCount ?? 0}
              myGuessCount={myGuessRows.length}
              myGuesses={myGuessByTarget}
              onSubmit={(selectedTargetIds) =>
                runAction("guess", async () => {
                  const selectedSet = new Set(selectedTargetIds);
                  const guessTargets = sortedPlayers.filter((player) => player.id !== me.id);
                  await Promise.all(
                    guessTargets.map((target) =>
                      submitGuess(
                        snapshot.room.id,
                        currentPrompt.id,
                        me.id,
                        target.id,
                        selectedSet.has(target.id),
                      ),
                    ),
                  );
                  await maybeAdvanceRoom(snapshot.room.id);
                })
              }
              prompt={currentPrompt.text}
              targets={sortedPlayers.filter((player) => player.id !== me.id)}
            />
          ) : null}

          {snapshot.room.phase === "revealing" && currentPrompt && revealTarget ? (
            <RevealingStage
              busy={Boolean(busyAction)}
              canControl={canRevealControl}
              deadlineAt={snapshot.room.phase_deadline_at}
              guessRows={revealGuessRows}
              onNext={() =>
                runAction("next-reveal", async () => {
                  await advanceReveal(snapshot.room.id, me.id);
                })
              }
              onReveal={() =>
                runAction("reveal", async () => {
                  await revealCurrentPlayer(snapshot.room.id, me.id);
                })
              }
              prompt={currentPrompt.text}
              target={{
                name: revealTarget.name,
                color: revealTarget.color,
                emoji: revealTarget.emoji,
              }}
              truth={truth}
              truthVisible={snapshot.room.reveal_truth_visible}
            />
          ) : null}

          {snapshot.room.phase === "leaderboard" ? (
            <LeaderboardStage
              busy={Boolean(busyAction)}
              hasNextRound={hasNextRound}
              myPlayerId={me.id}
              onContinue={() =>
                runAction("next-round", async () => {
                  await startNextRound(snapshot.room.id);
                })
              }
              players={leaderboard}
            />
          ) : null}

          {snapshot.room.phase === "finished" ? <FinishedStage players={leaderboard} /> : null}
        </div>
      </div>

      {me.is_host ? (
        <SettingsSheet
          onChange={setSettingsDraft}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
          open={settingsOpen}
          saving={settingsSaving}
          values={settingsDraft}
        />
      ) : null}
    </main>
  );
}
