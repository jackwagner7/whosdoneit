"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppBanner } from "@/components/app-banner";
import { EntryProfileForm } from "@/components/entry-profile-form";
import { DraftingStage } from "@/components/games/sayless/room/drafting-stage";
import { FinishedStage } from "@/components/games/sayless/room/finished-stage";
import { LobbyStage } from "@/components/games/sayless/room/lobby-stage";
import { PlayingStage } from "@/components/games/sayless/room/playing-stage";
import { RoundSummaryStage } from "@/components/games/sayless/room/round-summary-stage";
import { SettingsSheet } from "@/components/games/sayless/room/settings-sheet";
import { ProfileSettingsSheet } from "@/components/games/whosdoneit/room/profile-settings-sheet";
import { getGameBySlug } from "@/lib/game-catalog";
import {
  continueFromRoundSummary,
  getDraftCardForPlayer,
  getRoomSnapshotByCode,
  getRoundTeamScores,
  getTeamName,
  hasReadyTeams,
  joinRoom,
  maybeAdvanceGame,
  playAgainToLobby,
  SAY_LESS_TEAM_PALETTE,
  shuffleTeams,
  startPlayerTurn,
  startGame,
  submitDraftDecision,
  submitTurnAction,
  subscribeToRoom,
  updatePlayerProfile,
  updateRoomSettings,
  updateTeamName,
  updateTeamSelection,
} from "@/lib/games/sayless/game";
import {
  DEFAULT_PLAYER_COLOR,
  DEFAULT_PLAYER_EMOJI,
  buildColorChoices,
  buildEmojiChoices,
  refreshColorChoices,
  refreshEmojiChoices,
} from "@/lib/games/whosdoneit/game";
import {
  getDefaultHostSettings,
  getStoredHostSettings,
  setStoredHostSettings,
} from "@/lib/games/sayless/host-settings-preferences";
import {
  getDefaultPlayerPreferences,
  getStoredPlayerPreferences,
  hasStoredPlayerPreferences,
  setStoredPlayerPreferences,
} from "@/lib/player-preferences";
import { ROOM_LOADING_LABEL } from "@/lib/site-config";
import type { SayLessCard, SayLessRoomSettings, SayLessSnapshot } from "@/types/sayless";

const GAME = getGameBySlug("sayless");

type RoomClientProps = {
  code: string;
  initialSnapshot?: SayLessSnapshot | null;
};

type ProfileDraft = {
  name: string;
  color: string;
  emoji: string;
};

type TurnCardAction = "pass" | "correct";

function getEffectiveCardStatus(
  card: SayLessSnapshot["roomCards"][number],
  passedCardIds: Set<string>,
  clearedCardIds: Set<string>,
) {
  if (clearedCardIds.has(card.id)) {
    return "cleared";
  }

  if (passedCardIds.has(card.id)) {
    return "passed";
  }

  return card.status;
}

function getNextPlayableCardId(
  roomCards: SayLessSnapshot["roomCards"],
  passedCardIds: Set<string>,
  clearedCardIds: Set<string>,
) {
  let pendingCards = roomCards.filter(
    (card) => getEffectiveCardStatus(card, passedCardIds, clearedCardIds) === "pending",
  );

  if (pendingCards.length > 0) {
    return pendingCards[0]?.id ?? null;
  }

  const allCleared = roomCards.every(
    (card) => getEffectiveCardStatus(card, passedCardIds, clearedCardIds) === "cleared",
  );
  if (allCleared) {
    return null;
  }

  passedCardIds.clear();
  pendingCards = roomCards.filter(
    (card) => getEffectiveCardStatus(card, passedCardIds, clearedCardIds) === "pending",
  );
  return pendingCards[0]?.id ?? null;
}

function getOptimisticTurnState(
  roomCards: SayLessSnapshot["roomCards"],
  currentCardId: string | null,
  action: TurnCardAction,
  passedIds: string[],
  clearedIds: string[],
) {
  const nextPassedIds = new Set(passedIds);
  const nextClearedIds = new Set(clearedIds);

  if (currentCardId) {
    if (action === "pass") {
      nextPassedIds.add(currentCardId);
    } else {
      nextClearedIds.add(currentCardId);
      nextPassedIds.delete(currentCardId);
    }
  }

  const nextCardId = getNextPlayableCardId(roomCards, nextPassedIds, nextClearedIds);

  return {
    nextCardId,
    passedIds: [...nextPassedIds],
    clearedIds: [...nextClearedIds],
  };
}

function buildTeamSummaries(snapshot: SayLessSnapshot) {
  const roundScores = getRoundTeamScores(snapshot, snapshot.state.current_round_index);

  return Array.from({ length: snapshot.room.team_count }, (_, teamIndex) => {
    const players = snapshot.players.filter((player) => player.team_index === teamIndex);
    const topPlayer =
      [...players].sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))[0] ??
      null;

    return {
      teamIndex,
      teamName: getTeamName(snapshot.room, teamIndex),
      color: SAY_LESS_TEAM_PALETTE[teamIndex]?.color ?? "#0f172a",
      roundScore: roundScores[teamIndex] ?? 0,
      totalScore: players.reduce((sum, player) => sum + player.score, 0),
      topPlayerName: topPlayer?.name ?? null,
      topPlayerScore: topPlayer?.score ?? 0,
    };
  });
}

export function SayLessRoomClient({ code, initialSnapshot = null }: RoomClientProps) {
  const normalizedCode = code.toUpperCase();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SayLessSnapshot | null>(initialSnapshot);
  const [draftCard, setDraftCard] = useState<SayLessCard | null>(null);
  const [draftCardLoading, setDraftCardLoading] = useState(false);
  const [draftRefreshKey, setDraftRefreshKey] = useState(0);
  const [loading, setLoading] = useState(initialSnapshot === null);
  const [readyForJoinGate, setReadyForJoinGate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [optimisticTurnCardId, setOptimisticTurnCardId] = useState<string | null>(null);
  const [optimisticPassedCardIds, setOptimisticPassedCardIds] = useState<string[]>([]);
  const [optimisticClearedCardIds, setOptimisticClearedCardIds] = useState<string[]>([]);
  const [pendingTurnActions, setPendingTurnActions] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [joinDefaults, setJoinDefaults] = useState(() => getDefaultPlayerPreferences());
  const [settingsDraft, setSettingsDraft] = useState<SayLessRoomSettings>(() =>
    getDefaultHostSettings(),
  );
  const [teamNameDraft, setTeamNameDraft] = useState("");
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
  const refreshTimeoutRef = useRef<number | null>(null);
  const turnActionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const attemptedAutoJoinRef = useRef(false);
  const optimisticTurnStateRef = useRef({
    cardId: null as string | null,
    passedIds: [] as string[],
    clearedIds: [] as string[],
  });

  const loadSnapshot = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) {
        setLoading(true);
      }

      try {
        const next = await getRoomSnapshotByCode(normalizedCode);
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
    setJoinDefaults(getStoredPlayerPreferences());
    setSettingsDraft(getStoredHostSettings());
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
      if (refreshTimeoutRef.current !== null) {
        return;
      }

      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshTimeoutRef.current = null;
        void loadSnapshot();
      }, 120);
    });

    return unsubscribe;
  }, [loadSnapshot, snapshot?.room.id]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!snapshot?.room.id) {
      return;
    }

    if (snapshot.room.phase !== "playing" || !snapshot.state.turn_deadline_at) {
      return;
    }

    const interval = window.setInterval(() => {
      void maybeAdvanceGame(snapshot.room.id).catch(() => undefined);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [snapshot?.room.id, snapshot?.room.phase, snapshot?.state.turn_deadline_at]);

  const me = useMemo(() => {
    if (!snapshot || !playerId) {
      return null;
    }

    return snapshot.players.find((player) => player.id === playerId) ?? null;
  }, [playerId, snapshot]);

  const draftCounts = useMemo(() => {
    const counts = new Map<string, number>();
    snapshot?.roomCards.forEach((card) => {
      counts.set(card.drafted_by_player_id, (counts.get(card.drafted_by_player_id) ?? 0) + 1);
    });
    return counts;
  }, [snapshot?.roomCards]);

  const draftRoomId = snapshot?.room.id ?? null;
  const draftPhase = snapshot?.room.phase ?? null;
  const draftPlayerId = me?.id ?? null;
  const myDraftCount = draftPlayerId ? (draftCounts.get(draftPlayerId) ?? 0) : 0;
  const myDraftRejectionCount =
    snapshot && draftPlayerId
      ? snapshot.draftRejections.filter((rejection) => rejection.player_id === draftPlayerId)
          .length
      : 0;

  useEffect(() => {
    if (!snapshot || !me) {
      return;
    }

    localStorage.setItem("playerId", me.id);
    localStorage.setItem(`playerId:${snapshot.room.code}`, me.id);
    setStoredPlayerPreferences({ name: me.name, color: me.color, emoji: me.emoji });
  }, [me, snapshot]);

  useEffect(() => {
    if (!snapshot || !me?.is_host) {
      return;
    }

    setStoredHostSettings({
      teamCount: snapshot.room.team_count,
      cardsPerPlayer: snapshot.state.cards_per_player,
      roundCount: snapshot.state.round_count,
      turnSeconds: snapshot.state.turn_seconds,
    });
  }, [me, snapshot]);

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

  const clearOptimisticTurn = useCallback(() => {
    optimisticTurnStateRef.current = {
      cardId: null,
      passedIds: [],
      clearedIds: [],
    };
    setOptimisticTurnCardId(null);
    setOptimisticPassedCardIds([]);
    setOptimisticClearedCardIds([]);
  }, []);

  const setOptimisticTurnState = useCallback(
    (nextState: { nextCardId: string | null; passedIds: string[]; clearedIds: string[] }) => {
      optimisticTurnStateRef.current = {
        cardId: nextState.nextCardId,
        passedIds: nextState.passedIds,
        clearedIds: nextState.clearedIds,
      };
      setOptimisticTurnCardId(nextState.nextCardId);
      setOptimisticPassedCardIds(nextState.passedIds);
      setOptimisticClearedCardIds(nextState.clearedIds);
    },
    [],
  );

  useEffect(() => {
    optimisticTurnStateRef.current = {
      cardId: optimisticTurnCardId,
      passedIds: optimisticPassedCardIds,
      clearedIds: optimisticClearedCardIds,
    };
  }, [optimisticClearedCardIds, optimisticPassedCardIds, optimisticTurnCardId]);

  useEffect(() => {
    if (!snapshot || !me) {
      clearOptimisticTurn();
      return;
    }

    if (snapshot.room.phase !== "playing" || snapshot.state.active_player_id !== me.id) {
      clearOptimisticTurn();
      return;
    }

    const serverCardId = snapshot.state.active_card_entry_id ?? null;
    const optimisticCardId = optimisticTurnStateRef.current.cardId;
    const serverCaughtUp =
      optimisticCardId === null ||
      serverCardId === optimisticCardId ||
      serverCardId === null ||
      snapshot.state.active_player_id !== me.id;

    if (!busyAction && pendingTurnActions === 0 && serverCaughtUp) {
      clearOptimisticTurn();
    }
  }, [
    busyAction,
    clearOptimisticTurn,
    me,
    pendingTurnActions,
    snapshot,
    snapshot?.room.phase,
    snapshot?.state.active_player_id,
  ]);

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
        setPlayerId(player.id);
        await loadSnapshot();
      } catch (joinIssue) {
        setJoinError(joinIssue instanceof Error ? joinIssue.message : "Join failed.");
      } finally {
        setJoinLoading(false);
      }
    },
    [loadSnapshot],
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

  const handleSaveSettings = useCallback(async () => {
    if (!snapshot || !me) {
      return;
    }

    const allowHostControls = me.is_host && snapshot.room.phase === "lobby";

    setSettingsSaving(true);
    setActionError(null);

    try {
      await updateTeamName(snapshot.room.id, me.id, teamNameDraft);
      if (allowHostControls) {
        await updateRoomSettings(snapshot.room.id, me.id, settingsDraft);
        setStoredHostSettings(settingsDraft);
      }
      setSettingsOpen(false);
      await loadSnapshot();
    } catch (issue) {
      setActionError(issue instanceof Error ? issue.message : "Settings failed.");
    } finally {
      setSettingsSaving(false);
    }
  }, [loadSnapshot, me, settingsDraft, snapshot, teamNameDraft]);

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

  const queueTurnAction = useCallback(
    (action: TurnCardAction) => {
      if (!snapshot || !me) {
        return Promise.resolve();
      }

      const currentCardId =
        optimisticTurnStateRef.current.cardId ?? snapshot.state.active_card_entry_id ?? null;
      if (!currentCardId) {
        return Promise.resolve();
      }

      setActionError(null);
      setOptimisticTurnState(
        getOptimisticTurnState(
          snapshot.roomCards,
          currentCardId,
          action,
          optimisticTurnStateRef.current.passedIds,
          optimisticTurnStateRef.current.clearedIds,
        ),
      );
      setPendingTurnActions((current) => current + 1);

      const task = async () => {
        try {
          await submitTurnAction(snapshot.room.id, me.id, action);
        } catch (actionIssue) {
          const message =
            actionIssue instanceof Error
              ? actionIssue.message
              : "Action failed. Please retry.";
          setActionError(message);
          clearOptimisticTurn();
          await loadSnapshot();
        } finally {
          setPendingTurnActions((current) => Math.max(0, current - 1));
        }
      };

      turnActionQueueRef.current = turnActionQueueRef.current
        .catch(() => undefined)
        .then(task);

      return turnActionQueueRef.current;
    },
    [clearOptimisticTurn, loadSnapshot, me, setOptimisticTurnState, snapshot],
  );

  useEffect(() => {
    if (!draftRoomId || !draftPlayerId || draftPhase !== "drafting") {
      setDraftCard(null);
      setDraftCardLoading(false);
      return;
    }

    let active = true;
    setDraftCardLoading(true);

    void getDraftCardForPlayer(draftRoomId, draftPlayerId)
      .then((card) => {
        if (!active) {
          return;
        }

        setDraftCard(card);
        setDraftCardLoading(false);
      })
      .catch((issue) => {
        if (!active) {
          return;
        }

        setDraftCard(null);
        setDraftCardLoading(false);
        setActionError(issue instanceof Error ? issue.message : "Could not load card.");
      });

    return () => {
      active = false;
    };
  }, [
    draftPhase,
    draftPlayerId,
    draftRefreshKey,
    draftRoomId,
    myDraftCount,
    myDraftRejectionCount,
  ]);

  if (loading) {
    return (
      <main className="app-page">
        <div className="app-page-card app-page-card-wide app-page-card-mobile-fill h-[calc(100svh-1.5rem)] max-h-[calc(100svh-1.5rem)] sm:h-[80vh] sm:max-h-[80vh] flex flex-col overflow-hidden">
          <AppBanner label={ROOM_LOADING_LABEL} />
          <div className="flex flex-1 items-center justify-center">
            <div className="grid justify-items-center gap-3">
              <div
                aria-hidden="true"
                className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-black"
              />
              <p className="text-sm font-semibold text-slate-600">Loading room...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !snapshot) {
    return (
      <main className="app-page">
        <div className="app-page-card app-page-card-wide app-page-card-mobile-fill h-[calc(100svh-1.5rem)] max-h-[calc(100svh-1.5rem)] sm:h-[80vh] sm:max-h-[80vh] flex flex-col overflow-hidden">
          <AppBanner label={ROOM_LOADING_LABEL} />
          <p className="mt-6 text-xl font-bold">Room unavailable</p>
          <p className="mt-2 text-sm text-slate-600">{error ?? "Unknown error."}</p>
        </div>
      </main>
    );
  }

  const shouldAutoJoin =
    readyForJoinGate &&
    snapshot !== null &&
    !me &&
    !joinLoading &&
    hasStoredPlayerPreferences();

  if (!readyForJoinGate) {
    return (
      <main className="app-page">
        <div className="app-page-card app-page-card-wide app-page-card-mobile-fill h-[calc(100svh-1.5rem)] max-h-[calc(100svh-1.5rem)] sm:h-[80vh] sm:max-h-[80vh] flex flex-col overflow-hidden">
          <AppBanner label={ROOM_LOADING_LABEL} />
          <div className="flex flex-1 items-center justify-center">
            <div className="grid justify-items-center gap-3">
              <div
                aria-hidden="true"
                className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-black"
              />
              <p className="text-sm font-semibold text-slate-600">Loading room...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if ((!playerId || !me) && !shouldAutoJoin) {
    return (
      <main className="app-page">
        <EntryProfileForm
          bannerLabel={GAME?.name}
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
    return (
      <main className="app-page">
        <div className="app-page-card app-page-card-wide app-page-card-mobile-fill h-[calc(100svh-1.5rem)] max-h-[calc(100svh-1.5rem)] sm:h-[80vh] sm:max-h-[80vh] flex flex-col overflow-hidden">
          <AppBanner label={ROOM_LOADING_LABEL} />
          <div className="flex flex-1 items-center justify-center">
            <div className="grid justify-items-center gap-3">
              <div
                aria-hidden="true"
                className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-black"
              />
              <p className="text-sm font-semibold text-slate-600">Joining room...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const teamSummaries = buildTeamSummaries(snapshot);
  const currentRoundNumber = snapshot.state.current_round_index + 1;
  const isFinalRound = currentRoundNumber >= snapshot.state.round_count;
  const nextStartingTeamIndex = teamSummaries.reduce((lowest, team, index) => {
    if (team.totalScore < teamSummaries[lowest].totalScore) {
      return index;
    }
    return lowest;
  }, 0);
  const canStart = hasReadyTeams(snapshot.players, snapshot.room.team_count);
  const currentTeamName =
    typeof me.team_index === "number" ? getTeamName(snapshot.room, me.team_index) : "";
  const totalDraftTarget = snapshot.players.length * snapshot.state.cards_per_player;
  const doneDrafting =
    myDraftCount >= snapshot.state.cards_per_player ||
    snapshot.roomCards.length >= totalDraftTarget;
  const activePlayer =
    snapshot.players.find((player) => player.id === snapshot.state.active_player_id) ?? null;
  const optimisticPassedSet = new Set(optimisticPassedCardIds);
  const optimisticClearedSet = new Set(optimisticClearedCardIds);
  const currentTurnCardId =
    optimisticTurnCardId ?? snapshot.state.active_card_entry_id ?? null;
  const activeCard =
    snapshot.roomCards.find((card) => card.id === currentTurnCardId) ?? null;
  const activeTeamName =
    typeof activePlayer?.team_index === "number"
      ? getTeamName(snapshot.room, activePlayer.team_index)
      : "No team";
  const sameTeamAsActive =
    typeof me.team_index === "number" &&
    typeof activePlayer?.team_index === "number" &&
    me.team_index === activePlayer.team_index;
  const turnStarted = Boolean((snapshot.state.turn_deadline_at || optimisticTurnCardId) && activeCard);
  const remainingCards = snapshot.roomCards.filter(
    (card) => getEffectiveCardStatus(card, optimisticPassedSet, optimisticClearedSet) !== "cleared",
  ).length;
  const teamScorePills = teamSummaries.map((team) => ({
    label: team.teamName,
    score: team.totalScore,
  }));
  const allowHostControls = me.is_host && snapshot.room.phase === "lobby";
  const startTurnBusy = busyAction === "start-turn";

  return (
      <main className="app-page">
        <div className="app-page-card app-page-card-mobile-fill relative flex h-[calc(100svh-1.5rem)] max-h-[calc(100svh-1.5rem)] flex-col overflow-hidden sm:h-[80vh] sm:max-h-[80vh]">
        <AppBanner label={GAME?.name} />

        <div className="flex min-h-0 flex-1 flex-col gap-3 pt-3">
          <section className="-mx-[var(--card-padding)] border-b border-slate-200 px-[var(--card-padding)] pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-base font-black tracking-[0.08em] sm:text-lg">
                  Code: {snapshot.room.code}
                </p>
                <button
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-700"
                  onClick={() => void handleCopyRoomLink()}
                  type="button"
                >
                  {linkCopied ? "Copied" : "Copy link"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  aria-label="Profile settings"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-2xl font-bold leading-none"
                  onClick={openProfileSettings}
                  type="button"
                >
                  {"\uD83D\uDD8C\uFE0F"}
                </button>
                <button
                  aria-label="Room settings"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-2xl font-bold leading-none"
                  onClick={() => {
                    setSettingsDraft({
                      teamCount: snapshot.room.team_count,
                      cardsPerPlayer: snapshot.state.cards_per_player,
                      roundCount: snapshot.state.round_count,
                      turnSeconds: snapshot.state.turn_seconds,
                    });
                    setTeamNameDraft(currentTeamName);
                    setSettingsOpen(true);
                  }}
                  type="button"
                >
                  {"\u2699\uFE0F"}
                </button>
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
              isHost={me.is_host}
              myPlayerId={me.id}
              onChooseTeam={(teamIndex) =>
                runAction(`team:${teamIndex}`, async () => {
                  await updateTeamSelection(snapshot.room.id, me.id, teamIndex);
                })
              }
              onShuffle={() =>
                runAction("shuffle", async () => {
                  await shuffleTeams(snapshot.room.id, me.id);
                })
              }
              onStart={() =>
                runAction("start", async () => {
                  await startGame(snapshot.room.id, me.id);
                })
              }
              players={snapshot.players}
              teamCount={snapshot.room.team_count}
              teamNames={snapshot.room.team_names}
            />
          ) : null}
          {snapshot.room.phase === "drafting" ? (
            <DraftingStage
              busy={Boolean(busyAction)}
              card={draftCard}
              doneDrafting={doneDrafting}
              draftedCount={myDraftCount}
              loadingCard={draftCardLoading}
              onKeep={() =>
                runAction("draft-keep", async () => {
                  if (!draftCard) {
                    return;
                  }

                  setDraftCardLoading(true);
                  try {
                    await submitDraftDecision(snapshot.room.id, me.id, draftCard.id, true);
                  } catch (issue) {
                    if (
                      issue instanceof Error &&
                      issue.message.includes("just got taken")
                    ) {
                      await loadSnapshot();
                      setDraftRefreshKey((current) => current + 1);
                    }
                    throw issue;
                  }
                  setDraftCard(null);
                })
              }
              onSkip={() =>
                runAction("draft-skip", async () => {
                  if (!draftCard) {
                    return;
                  }

                  setDraftCardLoading(true);
                  try {
                    await submitDraftDecision(snapshot.room.id, me.id, draftCard.id, false);
                    setDraftRefreshKey((current) => current + 1);
                  } catch (issue) {
                    if (
                      issue instanceof Error &&
                      issue.message.includes("just got taken")
                    ) {
                      await loadSnapshot();
                      setDraftRefreshKey((current) => current + 1);
                    }
                    throw issue;
                  }
                  setDraftCard(null);
                })
              }
              targetCount={snapshot.state.cards_per_player}
              totalDrafted={snapshot.roomCards.length}
              totalTarget={totalDraftTarget}
            />
          ) : null}

          {snapshot.room.phase === "playing" ? (
            <PlayingStage
              activePlayer={activePlayer}
              activeTeamName={activeTeamName}
              busy={startTurnBusy}
              card={me.id === activePlayer?.id ? activeCard : null}
              deadlineAt={snapshot.state.turn_deadline_at}
              meIsActive={me.id === activePlayer?.id}
              onStartTurn={() =>
                runAction("start-turn", async () => {
                  const nextCardId = getNextPlayableCardId(
                    snapshot.roomCards,
                    new Set<string>(),
                    new Set<string>(),
                  );
                  setOptimisticTurnCardId(nextCardId);
                  await startPlayerTurn(snapshot.room.id, me.id);
                })
              }
              onCorrect={() => queueTurnAction("correct")}
              onPass={() => queueTurnAction("pass")}
              remainingCards={remainingCards}
              roundCount={snapshot.state.round_count}
              roundNumber={currentRoundNumber}
              sameTeamAsActive={Boolean(sameTeamAsActive)}
              teamScores={teamScorePills}
              totalCards={snapshot.roomCards.length}
              turnStarted={turnStarted}
            />
          ) : null}

          {snapshot.room.phase === "round_summary" ? (
            <RoundSummaryStage
              busy={Boolean(busyAction)}
              isFinalRound={isFinalRound}
              isHost={me.is_host}
              onContinue={() =>
                runAction("continue", async () => {
                  await continueFromRoundSummary(snapshot.room.id, me.id);
                })
              }
              roundCount={snapshot.state.round_count}
              roundNumber={currentRoundNumber}
              summaries={teamSummaries.map((team) => ({
                ...team,
                startsNextRound: team.teamIndex === nextStartingTeamIndex,
              }))}
            />
          ) : null}

          {snapshot.room.phase === "finished" ? (
            <FinishedStage
              busy={Boolean(busyAction)}
              isHost={me.is_host}
              onPlayAgain={() =>
                runAction("play-again", async () => {
                  await playAgainToLobby(snapshot.room.id, me.id);
                })
              }
              summaries={teamSummaries}
            />
          ) : null}
        </div>

        <SettingsSheet
          allowHostControls={allowHostControls}
          cardsPerPlayer={settingsDraft.cardsPerPlayer}
          isHost={me.is_host}
          onCardsPerPlayerChange={(cardsPerPlayer) =>
            setSettingsDraft((current) => ({ ...current, cardsPerPlayer }))
          }
          onClose={() => setSettingsOpen(false)}
          onRoundCountChange={(roundCount) =>
            setSettingsDraft((current) => ({ ...current, roundCount }))
          }
          onSave={handleSaveSettings}
          onTeamCountChange={(teamCount) =>
            setSettingsDraft((current) => ({ ...current, teamCount }))
          }
          onTeamNameChange={setTeamNameDraft}
          onTurnSecondsChange={(turnSeconds) =>
            setSettingsDraft((current) => ({ ...current, turnSeconds }))
          }
          open={settingsOpen}
          roundCount={settingsDraft.roundCount}
          saving={settingsSaving}
          teamCount={settingsDraft.teamCount}
          teamIndex={me.team_index}
          teamName={teamNameDraft}
          turnSeconds={settingsDraft.turnSeconds}
        />

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
      </div>
    </main>
  );
}
