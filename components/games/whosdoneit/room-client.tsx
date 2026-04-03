"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBanner } from "@/components/app-banner";
import { AnsweringStage } from "@/components/games/whosdoneit/room/answering-stage";
import { EntryProfileForm } from "@/components/entry-profile-form";
import { GameInfoSheet } from "@/components/game-info-sheet";
import { RoomLoadingScreen } from "@/components/room-loading-screen";
import { FinishedStage } from "@/components/games/whosdoneit/room/finished-stage";
import { GuessingStage } from "@/components/games/whosdoneit/room/guessing-stage";
import { LeaderboardStage } from "@/components/games/whosdoneit/room/leaderboard-stage";
import { LobbyStage } from "@/components/games/whosdoneit/room/lobby-stage";
import { ProfileSettingsSheet } from "@/components/games/whosdoneit/room/profile-settings-sheet";
import { PromptingStage } from "@/components/games/whosdoneit/room/prompting-stage";
import { RevealSummaryStage } from "@/components/games/whosdoneit/room/reveal-summary-stage";
import { RevealingStage } from "@/components/games/whosdoneit/room/revealing-stage";
import { SettingsSheet } from "@/components/games/whosdoneit/room/settings-sheet";
import { SubmissionWaitingStage } from "@/components/games/whosdoneit/room/submission-waiting-stage";
import { createRoom as createSayLessRoom } from "@/lib/games/sayless/game";
import { getStoredHostSettings as getStoredSayLessHostSettings } from "@/lib/games/sayless/host-settings-preferences";
import { getGameBySlug } from "@/lib/game-catalog";
import {
  addFakePlayers,
  advanceReveal,
  buildColorChoices,
  buildEmojiChoices,
  DEFAULT_PLAYER_COLOR,
  DEFAULT_PLAYER_EMOJI,
  getGameSnapshotByCode,
  getRoundCursor,
  getRoundProgress,
  getRevealPlayersForPrompt,
  joinRoom,
  maybeAdvanceRoom,
  playAgainToLobby,
  refreshColorChoices,
  refreshEmojiChoices,
  startGame,
  startNextRound,
  submitConfession,
  submitGuesses,
  submitPrompt,
  subscribeToRoom,
  updatePlayerProfile,
  updateRoomSettings,
} from "@/lib/games/whosdoneit/game";
import {
  getDefaultHostSettings,
  setStoredHostSettings,
} from "@/lib/games/whosdoneit/host-settings-preferences";
import {
  getDefaultPlayerPreferences,
  getStoredPlayerPreferences,
  hasStoredPlayerPreferences,
  setStoredPlayerPreferences,
} from "@/lib/player-preferences";
import type { GameSnapshot, GameType, Player } from "@/types/whosdoneit";

const GAME = getGameBySlug("whosdoneit");

type RoomClientProps = {
  code: string;
  initialSnapshot?: GameSnapshot | null;
};

type SettingsDraft = {
  promptSeconds: number;
  roundCount: number;
  answeringSeconds: number;
  guessingSeconds: number;
  revealSeconds: number;
  fastMode: boolean;
};

type ProfileDraft = {
  name: string;
  color: string;
  emoji: string;
};

function sortLeaderboard(players: Player[]) {
  return [...players].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  );
}

export function RoomClient({ code, initialSnapshot = null }: RoomClientProps) {
  const normalizedCode = code.toUpperCase();
  const router = useRouter();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState(initialSnapshot === null);
  const [readyForJoinGate, setReadyForJoinGate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [promptText, setPromptText] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [changingGame, setChangingGame] = useState<GameType | null>(null);
  const [addingFakePlayers, setAddingFakePlayers] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [joinDefaults, setJoinDefaults] = useState(() => getDefaultPlayerPreferences());
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({
    name: joinDefaults.name,
    color: joinDefaults.color || DEFAULT_PLAYER_COLOR,
    emoji: joinDefaults.emoji || DEFAULT_PLAYER_EMOJI,
  });
  const [profileColorOptions, setProfileColorOptions] = useState<string[]>(() =>
    buildColorChoices({
      selectedColor: joinDefaults.color || DEFAULT_PLAYER_COLOR,
    }),
  );
  const [profileEmojiOptions, setProfileEmojiOptions] = useState<string[]>(() =>
    buildEmojiChoices({
      selectedEmoji: joinDefaults.emoji || DEFAULT_PLAYER_EMOJI,
    }),
  );
  const attemptedAutoJoinRef = useRef(false);
  const latestSnapshotRequestIdRef = useRef(0);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>({
    ...getDefaultHostSettings(),
  });

  const loadSnapshot = useCallback(
    async (showSpinner = false) => {
      const requestId = latestSnapshotRequestIdRef.current + 1;
      latestSnapshotRequestIdRef.current = requestId;

      if (showSpinner) {
        setLoading(true);
      }

      try {
        const next = await getGameSnapshotByCode(normalizedCode);
        if (requestId !== latestSnapshotRequestIdRef.current) {
          return;
        }

        setSnapshot(next);
        setError(null);
      } catch (loadError) {
        if (requestId !== latestSnapshotRequestIdRef.current) {
          return;
        }

        const message =
          loadError instanceof Error ? loadError.message : "Could not load room.";
        setError(message);
      } finally {
        if (requestId === latestSnapshotRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [normalizedCode],
  );

  useEffect(() => {
    const storedPlayerId =
      localStorage.getItem(`playerId:${normalizedCode}`) ??
      localStorage.getItem("playerId");
    setPlayerId(storedPlayerId);
    setJoinDefaults(getStoredPlayerPreferences());
    setReadyForJoinGate(true);
    if (initialSnapshot) {
      setSnapshot(initialSnapshot);
      setLoading(false);
      return;
    }

    void loadSnapshot(true);
  }, [initialSnapshot, loadSnapshot, normalizedCode]);

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
      snapshot.room.phase !== "prompting" &&
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

  useEffect(() => {
    if (!snapshot || !me || !me.is_host) {
      return;
    }

    setStoredHostSettings({
      promptSeconds: snapshot.room.prompt_seconds,
      roundCount: snapshot.room.round_count,
      answeringSeconds: snapshot.room.answering_seconds,
      guessingSeconds: snapshot.room.guessing_seconds,
      revealSeconds: snapshot.room.reveal_seconds,
      fastMode: snapshot.room.fast_mode === true,
    });
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

  useEffect(() => {
    if (snapshot?.room.phase === "prompting" && !myPrompt) {
      setPromptText("");
    }
  }, [myPrompt, snapshot?.room.phase]);

  useEffect(() => {
    if (!loading && (error || !snapshot)) {
      router.replace("/");
    }
  }, [error, loading, router, snapshot]);

  const round = useMemo(
    () => (snapshot ? getRoundProgress(snapshot) : null),
    [snapshot],
  );
  const submittedPromptPlayerIds = useMemo(
    () => new Set(snapshot?.prompts.map((prompt) => prompt.submitted_by_player_id) ?? []),
    [snapshot?.prompts],
  );
  const roundCursor = useMemo(
    () => (snapshot ? getRoundCursor(snapshot.room) : { roundIndex: 0, promptIndex: 0 }),
    [snapshot],
  );
  const leaderboard = useMemo(
    () => (snapshot ? sortLeaderboard(snapshot.players) : []),
    [snapshot],
  );
  const hostPlayer = useMemo(
    () => snapshot?.players.find((player) => player.is_host) ?? null,
    [snapshot],
  );
  const testingEnabled = me?.name.trim() === "test";
  const openProfileSettings = useCallback(() => {
    if (!me) {
      return;
    }

    setProfileError(null);
    setProfileDraft({
      name: me.name,
      color: me.color || DEFAULT_PLAYER_COLOR,
      emoji: me.emoji || DEFAULT_PLAYER_EMOJI,
    });
    setProfileColorOptions(
      buildColorChoices({
        selectedColor: me.color,
      }),
    );
    setProfileEmojiOptions(
      buildEmojiChoices({
        selectedEmoji: me.emoji,
      }),
    );
    setProfileOpen(true);
  }, [me]);

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
    async (values: { code: string; name: string; color: string; emoji: string }) => {
      const targetCode = values.code.trim().toUpperCase();
      if (!targetCode || !values.name.trim()) {
        return;
      }

      setJoinLoading(true);
      setJoinError(null);

      try {
        const { room, player } = await joinRoom(
          targetCode,
          values.name,
          values.color,
          values.emoji,
        );
        setStoredPlayerPreferences({
          name: player.name,
          color: player.color,
          emoji: player.emoji,
        });
        localStorage.setItem("playerId", player.id);
        localStorage.setItem(`playerId:${room.code}`, player.id);
        if (room.code !== normalizedCode) {
          router.push(`/room/${room.code}`);
          return;
        }

        setPlayerId(player.id);
        await loadSnapshot();
      } catch (joinIssue) {
        setJoinError(joinIssue instanceof Error ? joinIssue.message : "Join failed.");
      } finally {
        setJoinLoading(false);
      }
    },
    [loadSnapshot, normalizedCode, router],
  );

  useEffect(() => {
    if (loading || error || !snapshot || me || joinLoading) {
      return;
    }

    if (attemptedAutoJoinRef.current || !hasStoredPlayerPreferences()) {
      return;
    }

    const storedPreferences = getStoredPlayerPreferences();
    if (!storedPreferences.name.trim()) {
      return;
    }

    attemptedAutoJoinRef.current = true;
    void handleInlineJoin({
      code: snapshot.room.code,
      name: storedPreferences.name,
      color: storedPreferences.color,
      emoji: storedPreferences.emoji,
    });
  }, [error, handleInlineJoin, joinLoading, loading, me, snapshot]);

  const handleSaveSettings = useCallback(
    async (settings: {
      promptSeconds: number;
      roundCount: number;
      answeringSeconds: number;
      guessingSeconds: number;
      revealSeconds: number;
      fastMode: boolean;
    }) => {
      if (!snapshot || !me || !me.is_host) {
        return;
      }

      setSettingsSaving(true);
      setActionError(null);
      try {
        await updateRoomSettings(snapshot.room.id, me.id, settings);
        setStoredHostSettings(settings);
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

  const handleChangeGame = useCallback(
    async (game: GameType) => {
      if (!snapshot || !me || !me.is_host || snapshot.room.phase !== "lobby") {
        return;
      }

      if (game === "whosdoneit") {
        return;
      }

      setChangingGame(game);
      setActionError(null);

      try {
        const { room, player } = await createSayLessRoom(me.name, {
          playerColor: me.color,
          playerEmoji: me.emoji,
          settings: getStoredSayLessHostSettings(),
        });
        setStoredPlayerPreferences({
          name: player.name,
          color: player.color,
          emoji: player.emoji,
        });
        localStorage.setItem("playerId", player.id);
        localStorage.setItem(`playerId:${room.code}`, player.id);
        router.push(`/room/${room.code}`);
      } catch (issue) {
        setActionError(issue instanceof Error ? issue.message : "Could not switch games.");
      } finally {
        setChangingGame(null);
      }
    },
    [me, router, snapshot],
  );

  const handleAddFakePlayers = useCallback(
    async (count: number) => {
      if (!snapshot || !me || !me.is_host || !testingEnabled) {
        return;
      }

      setAddingFakePlayers(true);
      setActionError(null);
      try {
        await addFakePlayers(snapshot.room.id, me.id, count);
        await loadSnapshot();
      } catch (issue) {
        setActionError(
          issue instanceof Error ? issue.message : "Could not add fake players.",
        );
      } finally {
        setAddingFakePlayers(false);
      }
    },
    [loadSnapshot, me, snapshot, testingEnabled],
  );

  const refreshProfileColors = useCallback(() => {
    setProfileColorOptions((previousOptions) => {
      const nextOptions = refreshColorChoices({
        previousChoices: previousOptions,
      });

      setProfileDraft((current) => ({
        ...current,
        color: nextOptions[0] ?? DEFAULT_PLAYER_COLOR,
      }));

      return nextOptions;
    });
  }, []);

  const refreshProfileEmojis = useCallback(() => {
    setProfileEmojiOptions((previousOptions) => {
      const nextOptions = refreshEmojiChoices({
        previousChoices: previousOptions,
      });

      setProfileDraft((current) => ({
        ...current,
        emoji: nextOptions[0] ?? DEFAULT_PLAYER_EMOJI,
      }));

      return nextOptions;
    });
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!snapshot || !me) {
      return;
    }

    setProfileSaving(true);
    setProfileError(null);

    try {
      const nextProfile = {
        name: profileDraft.name.trim(),
        color: profileDraft.color,
        emoji: profileDraft.emoji,
      };

      await updatePlayerProfile(snapshot.room.id, me.id, nextProfile);
      setStoredPlayerPreferences(nextProfile);
      setProfileOpen(false);
      await loadSnapshot();
    } catch (issue) {
      setProfileError(issue instanceof Error ? issue.message : "Profile update failed.");
    } finally {
      setProfileSaving(false);
    }
  }, [loadSnapshot, me, profileDraft, snapshot]);

  const handleCopyRoomLink = useCallback(async () => {
    try {
      const roomLink = `${window.location.origin}/room/${normalizedCode}`;
      await navigator.clipboard.writeText(roomLink);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1200);
    } catch {
      setLinkCopied(false);
    }
  }, [normalizedCode]);

  if (loading) {
    return <RoomLoadingScreen message="Loading room..." />;
  }

  if (error || !snapshot) {
    return null;
  }

  const shouldAutoJoin =
    readyForJoinGate &&
    snapshot !== null &&
    !me &&
    !joinLoading &&
    hasStoredPlayerPreferences();

  if (!readyForJoinGate) {
    return <RoomLoadingScreen message="Loading room..." />;
  }

  if ((!playerId || !me) && !shouldAutoJoin) {
    return (
      <main className="app-page">
        <EntryProfileForm
          error={joinError}
          initialCode={snapshot.room.code}
          initialColor={joinDefaults.color}
          initialEmoji={joinDefaults.emoji}
          initialName={joinDefaults.name}
          loading={joinLoading}
          onSubmit={handleInlineJoin}
          submitLabel="Join"
          title="Join Room"
        />
      </main>
    );
  }

  if (!playerId || !me) {
    return <RoomLoadingScreen message="Joining room..." />;
  }

  const submittedPromptCount = snapshot.prompts.length;
  const canStart = snapshot.players.length >= 2;

  const currentPrompt = round?.currentPrompt ?? null;
  const confessions = round?.confessions ?? [];
  const guesses = round?.guesses ?? [];
  const sortedPlayers = round?.players ?? snapshot.players;
  const myConfession = confessions.find((entry) => entry.player_id === me.id);
  const myConfessionAnswer = myConfession ? myConfession.answer : undefined;
  const confessionParticipantIds = new Set(
    confessions.map((entry) => entry.player_id),
  );
  const confessionParticipants = sortedPlayers.filter((player) =>
    confessionParticipantIds.has(player.id),
  );
  const revealPlayers = getRevealPlayersForPrompt(
    sortedPlayers,
    confessions,
    guesses,
  );
  const isConfessionParticipant = confessionParticipantIds.has(me.id);

  const myGuessRows = guesses.filter((entry) => entry.guessing_player_id === me.id);
  const myGuessByTarget = new Map(
    myGuessRows.map((entry) => [entry.target_player_id, entry.guessed_answer]),
  );
  const myGuessSignature = myGuessRows
    .map((entry) => `${entry.target_player_id}:${entry.guessed_answer ? "1" : "0"}`)
    .sort()
    .join("|");
  const expectedGuessesPerPlayer = Math.max(confessionParticipants.length - 1, 0);
  const guessesByGuesser = new Map<string, number>();
  guesses.forEach((entry) => {
    guessesByGuesser.set(
      entry.guessing_player_id,
      (guessesByGuesser.get(entry.guessing_player_id) ?? 0) + 1,
    );
  });
  const submittedGuessPlayerCount = confessionParticipants.reduce(
    (count, player) =>
      count + ((guessesByGuesser.get(player.id) ?? 0) >= expectedGuessesPerPlayer ? 1 : 0),
    0,
  );
  const myGuessSubmissionCount = guessesByGuesser.get(me.id) ?? 0;
  const myGuessesSubmitted =
    !isConfessionParticipant || myGuessSubmissionCount >= expectedGuessesPerPlayer;
  const isGuessSubmitting =
    snapshot.room.phase === "guessing" && busyAction === "guess";
  const waitingGuessSubmittedCount =
    submittedGuessPlayerCount +
    (isGuessSubmitting && isConfessionParticipant && !myGuessesSubmitted ? 1 : 0);

  const revealTarget =
    snapshot.room.phase === "revealing"
      ? revealPlayers[snapshot.room.reveal_player_index] ?? null
      : null;
  const truth = revealTarget
    ? confessions.find((entry) => entry.player_id === revealTarget.id)?.answer
    : undefined;
  const canRevealControl = Boolean(
    revealTarget && (revealTarget.id === me.id || me.is_host),
  );
  const playersById = new Map(snapshot.players.map((player) => [player.id, player]));
  const promptWaitingPlayers = snapshot.players.filter(
    (player) => !submittedPromptPlayerIds.has(player.id),
  );
  const confessionWaitingPlayers = sortedPlayers.filter(
    (player) => !confessionParticipantIds.has(player.id),
  );
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
  const confessionByPlayerId = new Map(
    confessions.map((entry) => [entry.player_id, entry.answer]),
  );
  const revealTruthRows = revealPlayers.map((player) => ({
    id: player.id,
    name: player.name,
    color: player.color,
    emoji: player.emoji,
    answer: confessionByPlayerId.get(player.id) === true,
  }));
  const guessWaitingPlayers = confessionParticipants.filter((player) => {
    const submittedGuesses = guessesByGuesser.get(player.id) ?? 0;
    const effectiveSubmittedGuesses =
      player.id === me.id && isGuessSubmitting && !myGuessesSubmitted
        ? expectedGuessesPerPlayer
        : submittedGuesses;
    return effectiveSubmittedGuesses < expectedGuessesPerPlayer;
  });

  const hasNextRound =
    roundCursor.promptIndex + 1 < snapshot.prompts.length ||
    roundCursor.roundIndex + 1 < snapshot.room.round_count;
  const questionsPerRound = Math.max(snapshot.prompts.length, 1);
  const totalQuestions = Math.max(questionsPerRound * snapshot.room.round_count, 1);
  const questionNumber = Math.min(
    totalQuestions,
    roundCursor.roundIndex * questionsPerRound + roundCursor.promptIndex + 1,
  );

  return (
    <main className="app-page">
      <div className="app-page-card app-page-card-wide app-page-card-mobile-fill h-[calc(100svh-1.5rem)] max-h-[calc(100svh-1.5rem)] sm:h-[80vh] sm:max-h-[80vh] relative flex flex-col overflow-hidden">
        <AppBanner
          label={GAME?.name}
          leftAction={{
            label: "Go home",
            icon: "home",
            onClick: () => router.push("/"),
          }}
          rightAction={{
            label: "Game info",
            icon: "info",
            onClick: () => setInfoOpen(true),
          }}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-2 pt-2">
          <section className="-mx-[var(--card-padding)] border-b border-slate-200 px-[var(--card-padding)] pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  aria-label={linkCopied ? "Room link copied" : "Copy room link"}
                  className={`rounded-lg px-1 text-base font-black tracking-[0.08em] transition-colors sm:text-lg ${
                    linkCopied ? "text-emerald-600" : "text-slate-950"
                  }`}
                  onClick={() => void handleCopyRoomLink()}
                  title={linkCopied ? "Copied" : "Click to copy room link"}
                  type="button"
                >
                  {snapshot.room.code}
                </button>
              </div>
              <div className="flex items-center gap-2">
                {snapshot.room.phase === "lobby" ? (
                  <button
                    aria-label="Profile settings"
                    className="rounded-lg border border-slate-300 px-2.75 py-1.75 text-xl font-bold leading-none"
                    onClick={openProfileSettings}
                    type="button"
                  >
                    {"\uD83D\uDD8C\uFE0F"}
                  </button>
                ) : null}
                {me.is_host ? (
                  <button
                    aria-label="Host game settings"
                    className="rounded-lg border border-slate-300 px-2.75 py-1.75 text-xl font-bold leading-none"
                    onClick={() => {
                      setSettingsDraft({
                      promptSeconds: snapshot.room.prompt_seconds,
                      roundCount: snapshot.room.round_count,
                      answeringSeconds: snapshot.room.answering_seconds,
                      guessingSeconds: snapshot.room.guessing_seconds,
                      revealSeconds: snapshot.room.reveal_seconds,
                      fastMode: snapshot.room.fast_mode === true,
                    });
                    setSettingsOpen(true);
                  }}
                    type="button"
                  >
                    {"\u2699\uFE0F"}
                  </button>
                ) : null}
              </div>
            </div>
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
              hostPlayer={hostPlayer}
              isHost={me.is_host}
              onStart={() =>
                runAction("start", async () => {
                  await startGame(snapshot.room.id, me.id);
                })
              }
              players={snapshot.players}
            />
          ) : null}

          {snapshot.room.phase === "prompting" ? (
            myPrompt ? (
              <SubmissionWaitingStage
                phaseLabel="Prompt"
                submittedCount={submittedPromptCount}
                totalCount={snapshot.players.length}
                waitingPlayers={promptWaitingPlayers}
              />
            ) : (
              <PromptingStage
                busy={Boolean(busyAction)}
                deadlineAt={snapshot.room.phase_deadline_at}
                onPromptTextChange={setPromptText}
                onSubmitPrompt={() =>
                  runAction("prompt", async () => {
                    await submitPrompt(snapshot.room.id, me.id, promptText);
                  })
                }
                playerCount={snapshot.players.length}
                promptText={promptText}
                currentRoundNumber={roundCursor.roundIndex + 1}
                roundCount={snapshot.room.round_count}
                submittedPromptCount={submittedPromptCount}
              />
            )
          ) : null}

          {snapshot.room.phase === "answering" && currentPrompt ? (
            myConfession ? (
              <SubmissionWaitingStage
                phaseLabel="Confessional"
                submittedCount={round?.confessionCount ?? 0}
                totalCount={round?.expectedConfessions ?? 0}
                waitingPlayers={confessionWaitingPlayers}
              />
            ) : (
              <AnsweringStage
                answer={myConfessionAnswer}
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
            )
          ) : null}

          {snapshot.room.phase === "guessing" && currentPrompt ? (
            !isConfessionParticipant || myGuessesSubmitted || isGuessSubmitting ? (
              <SubmissionWaitingStage
                phaseLabel="Accusations"
                submittedCount={Math.min(
                  waitingGuessSubmittedCount,
                  confessionParticipants.length,
                )}
                totalCount={confessionParticipants.length}
                waitingPlayers={guessWaitingPlayers}
              />
            ) : (
              <GuessingStage
                key={`${currentPrompt.id}:${myGuessSignature}`}
                busy={Boolean(busyAction)}
                deadlineAt={snapshot.room.phase_deadline_at}
                myGuesses={myGuessByTarget}
                onSubmit={(selectedTargetIds) =>
                  runAction("guess", async () => {
                    const selectedSet = new Set(selectedTargetIds);
                    const guessTargets = confessionParticipants.filter(
                      (player) => player.id !== me.id,
                    );
                    await submitGuesses(
                      snapshot.room.id,
                      currentPrompt.id,
                      me.id,
                      guessTargets.map((target) => ({
                        targetPlayerId: target.id,
                        guessedAnswer: selectedSet.has(target.id),
                      })),
                    );
                    await maybeAdvanceRoom(snapshot.room.id);
                  })
                }
                prompt={currentPrompt.text}
                submittedPlayerCount={submittedGuessPlayerCount}
                targets={confessionParticipants.filter((player) => player.id !== me.id)}
                totalPlayerCount={confessionParticipants.length}
              />
            )
          ) : null}

          {snapshot.room.phase === "revealing" && currentPrompt && revealTarget ? (
            <RevealingStage
              key={`${currentPrompt.id}:${revealTarget.id}`}
              busy={Boolean(busyAction)}
              canControl={canRevealControl}
              deadlineAt={snapshot.room.phase_deadline_at}
              guessRows={revealGuessRows}
              onNext={() =>
                runAction("next-reveal", async () => {
                  await advanceReveal(snapshot.room.id, me.id);
                })
              }
              prompt={currentPrompt.text}
              target={{
                id: revealTarget.id,
                name: revealTarget.name,
                color: revealTarget.color,
                emoji: revealTarget.emoji,
              }}
              truth={truth}
              truthVisible={snapshot.room.reveal_truth_visible}
            />
          ) : null}

          {snapshot.room.phase === "revealing" && currentPrompt && !revealTarget ? (
            <RevealSummaryStage
              busy={Boolean(busyAction)}
              canAdvance={me.is_host}
              deadlineAt={snapshot.room.phase_deadline_at}
              hostPlayer={hostPlayer}
              onNext={() =>
                runAction("next-reveal-summary", async () => {
                  await advanceReveal(snapshot.room.id, me.id);
                })
              }
              prompt={currentPrompt.text}
              truthRows={revealTruthRows}
            />
          ) : null}

          {snapshot.room.phase === "leaderboard" ? (
            <LeaderboardStage
              busy={Boolean(busyAction)}
              hasNextRound={hasNextRound}
              hostPlayer={hostPlayer}
              isHost={me.is_host}
              myPlayerId={me.id}
              questionNumber={questionNumber}
              onContinue={() =>
                runAction("next-round", async () => {
                  await startNextRound(snapshot.room.id, me.id);
                })
              }
              players={leaderboard}
              totalQuestions={totalQuestions}
            />
          ) : null}

          {snapshot.room.phase === "finished" ? (
            <FinishedStage
              busy={Boolean(busyAction)}
              hostPlayer={hostPlayer}
              isHost={me.is_host}
              onPlayAgain={() =>
                runAction("play-again", async () => {
                  await playAgainToLobby(snapshot.room.id, me.id);
                })
              }
              players={leaderboard}
            />
          ) : null}
        </div>

        <ProfileSettingsSheet
          colorOptions={profileColorOptions}
          emojiOptions={profileEmojiOptions}
          error={profileError}
          onChange={setProfileDraft}
          onClose={() => setProfileOpen(false)}
          onRefreshColors={refreshProfileColors}
          onRefreshEmojis={refreshProfileEmojis}
          onSave={handleSaveProfile}
          open={profileOpen}
          saving={profileSaving}
          values={profileDraft}
        />

        <GameInfoSheet
          onClose={() => setInfoOpen(false)}
          open={infoOpen}
          steps={[
            "One player writes the prompt for the round.",
            "Everyone else secretly answers yes or no to that prompt.",
            "Players accuse each other by guessing who answered yes.",
            "The Trial reveals each truth and awards points for correct reads.",
          ]}
          summary="Who's Done It is a social deduction party game about reading your friends. Each round starts with a fresh prompt, hidden answers, public accusations, and then a reveal."
          tips={[
            "Prompts work best when they are specific enough to split the room.",
            "You score by reading people, not by being the loudest guesser.",
          ]}
          title="How To Play"
        />

        {me.is_host ? (
          <SettingsSheet
            addingFakePlayers={addingFakePlayers}
            allowTesting={testingEnabled}
            allowFakePlayers={snapshot.room.phase === "lobby"}
            allowGameChange={snapshot.room.phase === "lobby"}
            allowRoundControls={snapshot.room.phase === "lobby"}
            changingGame={changingGame}
            currentGame="whosdoneit"
            onAddFakePlayers={handleAddFakePlayers}
            onChange={setSettingsDraft}
            onGameChange={handleChangeGame}
            onClose={() => setSettingsOpen(false)}
            onSave={handleSaveSettings}
            open={settingsOpen}
            saving={settingsSaving}
            values={settingsDraft}
          />
        ) : null}

      </div>
    </main>
  );
}
