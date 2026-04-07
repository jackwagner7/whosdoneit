"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBanner } from "@/components/app-banner";
import { EditIcon } from "@/components/edit-icon";
import { EntryProfileForm } from "@/components/entry-profile-form";
import { GameInfoSheet } from "@/components/game-info-sheet";
import { RoomLoadingScreen } from "@/components/room-loading-screen";
import { RoomHeaderMenu } from "@/components/room-header-menu";
import { SettingsIcon } from "@/components/settings-icon";
import { DraftingStage } from "@/components/games/sayless/room/drafting-stage";
import { FinishedStage } from "@/components/games/sayless/room/finished-stage";
import { LobbyStage } from "@/components/games/sayless/room/lobby-stage";
import { PlayingStage } from "@/components/games/sayless/room/playing-stage";
import { RoundSummaryStage } from "@/components/games/sayless/room/round-summary-stage";
import { SettingsSheet } from "@/components/games/sayless/room/settings-sheet";
import { ProfileSettingsSheet } from "@/components/games/whosdoneit/room/profile-settings-sheet";
import { getGameBySlug } from "@/lib/game-catalog";
import { getStoredHostSettings as getStoredWhosDoneItHostSettings } from "@/lib/games/whosdoneit/host-settings-preferences";
import {
  addFakePlayers,
  addHostedPlayer,
  continueFromRoundSummary,
  getDraftBatchForPlayer,
  getCardsPerPlayerForDraftedCards,
  getRecommendedCardsPerPlayer,
  getRoomSnapshotByCode,
  getRoundTeamScores,
  getTeamName,
  getTotalDraftedCards,
  hasReadyTeams,
  isTestBotName,
  joinRoom,
  kickPlayer,
  maybeAdvanceGame,
  playAgainToLobby,
  runTestBots,
  SAY_LESS_TEAM_PALETTE,
  shuffleTeams,
  skipTurn,
  startPlayerTurn,
  startGame,
  submitDraftDecision,
  submitTurnAction,
  subscribeToRoom,
  switchRoomToWhosDoneIt,
  toggleTurnPause,
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
import type {
  SayLessCard,
  SayLessDraftBatchResponse,
  SayLessRoomSettings,
  SayLessSnapshot,
} from "@/types/sayless";
import type { GameType } from "@/types/whosdoneit";

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
  if (snapshot.room.team_count < 2) {
    return [...snapshot.players]
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
      .map((player, index) => ({
        teamIndex: index,
        teamName: player.name,
        color: player.color,
        background: "#f8fafc",
        roundScore: 0,
        totalScore: player.score,
        topPlayerName: player.name,
        topPlayerScore: player.score,
      }));
  }

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
      background: SAY_LESS_TEAM_PALETTE[teamIndex]?.background ?? "#f8fafc",
      roundScore: roundScores[teamIndex] ?? 0,
      totalScore: players.reduce((sum, player) => sum + player.score, 0),
      topPlayerName: topPlayer?.name ?? null,
      topPlayerScore: topPlayer?.score ?? 0,
    };
  });
}

function buildRoundSummaryTeams(snapshot: SayLessSnapshot) {
  if (snapshot.room.team_count < 2) {
    const playerRoundScores = new Map<string, number>();

    snapshot.roundResults
      .filter((result) => result.round_index === snapshot.state.current_round_index)
      .forEach((result) => {
        playerRoundScores.set(
          result.player_id,
          (playerRoundScores.get(result.player_id) ?? 0) + result.points,
        );
      });

    return [...snapshot.players]
      .map((player, index) => ({
        teamIndex: index,
        teamName: player.name,
        color: player.color,
        background: "#f8fafc",
        players: [
          {
            id: player.id,
            name: player.name,
            color: player.color,
            emoji: player.emoji,
            roundScore: playerRoundScores.get(player.id) ?? 0,
          },
        ],
        roundTotal: playerRoundScores.get(player.id) ?? 0,
        rounds: Array.from({ length: snapshot.state.current_round_index + 1 }, (_, roundIndex) =>
          snapshot.roundResults
            .filter((result) => result.round_index === roundIndex && result.player_id === player.id)
            .reduce((sum, result) => sum + result.points, 0),
        ),
        total: player.score,
      }))
      .sort((left, right) => right.total - left.total || left.teamName.localeCompare(right.teamName));
  }

  const playerRoundScores = new Map<string, number>();
  const playedRoundCount = snapshot.state.current_round_index + 1;
  const roundScoresByRound = Array.from({ length: playedRoundCount }, (_, roundIndex) =>
    getRoundTeamScores(snapshot, roundIndex),
  );

  snapshot.roundResults
    .filter((result) => result.round_index === snapshot.state.current_round_index)
    .forEach((result) => {
      playerRoundScores.set(
        result.player_id,
        (playerRoundScores.get(result.player_id) ?? 0) + result.points,
      );
    });

  return Array.from({ length: snapshot.room.team_count }, (_, teamIndex) => {
    const players = snapshot.players
      .filter((player) => player.team_index === teamIndex)
      .map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        emoji: player.emoji,
        roundScore: playerRoundScores.get(player.id) ?? 0,
      }))
      .sort(
        (left, right) =>
          right.roundScore - left.roundScore || left.name.localeCompare(right.name),
      );

    return {
      teamIndex,
      teamName: getTeamName(snapshot.room, teamIndex),
      color: SAY_LESS_TEAM_PALETTE[teamIndex]?.color ?? "#0f172a",
      background: SAY_LESS_TEAM_PALETTE[teamIndex]?.background ?? "#f8fafc",
      players,
      roundTotal: players.reduce((sum, player) => sum + player.roundScore, 0),
      rounds: roundScoresByRound.map((scores) => scores[teamIndex] ?? 0),
      total: roundScoresByRound.reduce((sum, scores) => sum + (scores[teamIndex] ?? 0), 0),
    };
  }).sort(
    (left, right) =>
      right.total - left.total || left.teamName.localeCompare(right.teamName),
  );
}

function canStartSayLessGame(snapshot: SayLessSnapshot) {
  if (snapshot.room.team_count < 2) {
    return snapshot.players.length >= 1;
  }

  const counts = Array.from({ length: snapshot.room.team_count }, () => 0);
  snapshot.players.forEach((player) => {
    if (
      typeof player.team_index === "number" &&
      player.team_index >= 0 &&
      player.team_index < snapshot.room.team_count
    ) {
      counts[player.team_index] += 1;
    }
  });

  return counts.every((count) => count >= 2);
}

export function SayLessRoomClient({ code, initialSnapshot = null }: RoomClientProps) {
  const router = useRouter();
  const normalizedCode = code.toUpperCase();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SayLessSnapshot | null>(initialSnapshot);
  const [draftHand, setDraftHand] = useState<SayLessCard[]>([]);
  const [draftBatchLoading, setDraftBatchLoading] = useState(false);
  const [draftDuplicateCount, setDraftDuplicateCount] = useState(0);
  const [loading, setLoading] = useState(initialSnapshot === null);
  const [readyForJoinGate, setReadyForJoinGate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [optimisticTurnCardId, setOptimisticTurnCardId] = useState<string | null>(null);
  const [optimisticPassedCardIds, setOptimisticPassedCardIds] = useState<string[]>([]);
  const [optimisticClearedCardIds, setOptimisticClearedCardIds] = useState<string[]>([]);
  const [pendingTurnActions, setPendingTurnActions] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [changingGame, setChangingGame] = useState<GameType | null>(null);
  const [addingFakePlayers, setAddingFakePlayers] = useState(false);
  const [addingHostedPlayer, setAddingHostedPlayer] = useState(false);
  const [kickingPlayerId, setKickingPlayerId] = useState<string | null>(null);
  const [hostDraftPlayerId, setHostDraftPlayerId] = useState<string | null>(null);
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
  const previousLobbyPlayerCountRef = useRef<number | null>(null);
  const latestSnapshotRequestIdRef = useRef(0);
  const drivingTestBotsRef = useRef(false);
  const optimisticTurnStateRef = useRef({
    cardId: null as string | null,
    passedIds: [] as string[],
    clearedIds: [] as string[],
  });
  const currentTurnKeyRef = useRef<string | null>(null);
  const knownRoundResultIdsRef = useRef<Set<string>>(new Set());
  const [autoJoinBlocked, setAutoJoinBlocked] = useState(false);
  const [currentTurnSuccessfulCards, setCurrentTurnSuccessfulCards] = useState<
    Array<{
      id: string;
      title: string;
      points: number;
    }>
  >([]);

  const loadSnapshot = useCallback(
    async (showSpinner = false) => {
      const requestId = latestSnapshotRequestIdRef.current + 1;
      latestSnapshotRequestIdRef.current = requestId;

      if (showSpinner) {
        setLoading(true);
      }

      try {
        const next = await getRoomSnapshotByCode(normalizedCode);
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
    const removedMarkerKey = `removedFromRoom:${normalizedCode}`;
    const storedPlayerId =
      localStorage.getItem(`playerId:${normalizedCode}`) ??
      localStorage.getItem("playerId");
    setPlayerId(storedPlayerId);
    setJoinDefaults(getStoredPlayerPreferences());
    setSettingsDraft(getStoredHostSettings());
    setAutoJoinBlocked(sessionStorage.getItem(removedMarkerKey) === "1");
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

  const hasTestBots = useMemo(
    () => snapshot?.players.some((player) => isTestBotName(player.name)) ?? false,
    [snapshot?.players],
  );
  const hostPlayer = useMemo(
    () => snapshot?.players.find((player) => player.is_host) ?? null,
    [snapshot],
  );
  const testingEnabled = me?.name.trim() === "test";

  const activePlayerIsTestBot = useMemo(() => {
    if (!snapshot?.state.active_player_id) {
      return false;
    }

    const activePlayer =
      snapshot.players.find((player) => player.id === snapshot.state.active_player_id) ?? null;

    return activePlayer ? isTestBotName(activePlayer.name) : false;
  }, [snapshot]);

  const draftCounts = useMemo(() => {
    const counts = new Map<string, number>();
    snapshot?.roomCards.forEach((card) => {
      counts.set(card.drafted_by_player_id, (counts.get(card.drafted_by_player_id) ?? 0) + 1);
    });
    return counts;
  }, [snapshot?.roomCards]);

  const draftRoomId = snapshot?.room.id ?? null;
  const draftPhase = snapshot?.room.phase ?? null;
  const isTeamless = (snapshot?.room.team_count ?? 2) < 2;
  const hostPhoneOnly = snapshot?.state.host_phone_only === true;
  const draftMode = snapshot?.state.draft_mode ?? settingsDraft.draftMode;
  const isDraftless = draftMode === "draftless";
  const draftablePlayers = useMemo(
    () =>
      (snapshot?.players ?? []).filter(
        (player) => (draftCounts.get(player.id) ?? 0) < (snapshot?.state.cards_per_player ?? 0),
      ),
    [draftCounts, snapshot?.players, snapshot?.state.cards_per_player],
  );
  const draftPlayerId =
    hostPhoneOnly && me?.is_host ? hostDraftPlayerId : me?.id ?? null;
  const myDraftCount = draftPlayerId ? (draftCounts.get(draftPlayerId) ?? 0) : 0;
  const draftCard = draftHand[0] ?? null;

  useEffect(() => {
    if (!hostPhoneOnly || !me?.is_host || draftPhase !== "drafting") {
      setHostDraftPlayerId(null);
      return;
    }

    if (hostDraftPlayerId && draftablePlayers.some((player) => player.id === hostDraftPlayerId)) {
      return;
    }

    setHostDraftPlayerId(null);
  }, [draftPhase, draftablePlayers, hostDraftPlayerId, hostPhoneOnly, me?.is_host]);

  useEffect(() => {
    if (!snapshot || !me) {
      return;
    }

    sessionStorage.removeItem(`removedFromRoom:${snapshot.room.code}`);
    setAutoJoinBlocked(false);
    localStorage.setItem("playerId", me.id);
    localStorage.setItem(`playerId:${snapshot.room.code}`, me.id);
    setStoredPlayerPreferences({ name: me.name, color: me.color, emoji: me.emoji });
  }, [me, snapshot]);

  useEffect(() => {
    if (!snapshot || !playerId || me) {
      return;
    }

    const storedRoomPlayerId = localStorage.getItem(`playerId:${normalizedCode}`);
    if (storedRoomPlayerId !== playerId) {
      return;
    }

    localStorage.removeItem(`playerId:${normalizedCode}`);
    if (localStorage.getItem("playerId") === playerId) {
      localStorage.removeItem("playerId");
    }
    sessionStorage.setItem(`removedFromRoom:${normalizedCode}`, "1");
    attemptedAutoJoinRef.current = true;
    setAutoJoinBlocked(true);
    setJoinError("The host removed you from this room.");
    setPlayerId(null);
  }, [me, normalizedCode, playerId, snapshot]);

  useEffect(() => {
    if (!snapshot || !me?.is_host) {
      return;
    }

    setStoredHostSettings({
      teamCount: snapshot.room.team_count,
      cardsPerPlayer: snapshot.state.cards_per_player,
      roundCount: snapshot.state.round_count,
      turnSeconds: snapshot.state.turn_seconds,
      draftMode: snapshot.state.draft_mode,
      hostPhoneOnly: snapshot.state.host_phone_only,
    });
  }, [me, snapshot]);

  useEffect(() => {
    if (!snapshot || !me?.is_host || snapshot.room.phase !== "lobby") {
      previousLobbyPlayerCountRef.current = null;
      return;
    }

    const playerCount = snapshot.players.length;
    const recommendedCardsPerPlayer = getRecommendedCardsPerPlayer(playerCount);
    const previousPlayerCount = previousLobbyPlayerCountRef.current;
    previousLobbyPlayerCountRef.current = playerCount;

    if (
      previousPlayerCount !== null &&
      playerCount <= previousPlayerCount
    ) {
      return;
    }

    setSettingsDraft((current) =>
      current.cardsPerPlayer === recommendedCardsPerPlayer
        ? current
        : { ...current, cardsPerPlayer: recommendedCardsPerPlayer },
    );

    if (snapshot.state.cards_per_player === recommendedCardsPerPlayer) {
      return;
    }

    const nextSettings = {
      teamCount: snapshot.room.team_count,
      cardsPerPlayer: recommendedCardsPerPlayer,
      roundCount: snapshot.state.round_count,
      turnSeconds: snapshot.state.turn_seconds,
      draftMode: snapshot.state.draft_mode,
      hostPhoneOnly: snapshot.state.host_phone_only,
    };

    void updateRoomSettings(snapshot.room.id, me.id, nextSettings)
      .then(async () => {
        setStoredHostSettings(nextSettings);
        await loadSnapshot();
      })
      .catch((issue) => {
        setActionError(
          issue instanceof Error ? issue.message : "Could not refresh draft settings.",
        );
      });
  }, [loadSnapshot, me, snapshot]);

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
        sessionStorage.removeItem(`removedFromRoom:${room.code}`);
        setAutoJoinBlocked(false);
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
    if (loading || error || !snapshot || me || joinLoading || autoJoinBlocked) {
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
  }, [autoJoinBlocked, error, handleInlineJoin, joinLoading, loading, me, snapshot]);

  const handleSaveSettings = useCallback(async () => {
    if (!snapshot || !me) {
      return;
    }

    const allowHostControls = me.is_host && snapshot.room.phase === "lobby";

    setSettingsSaving(true);
    setActionError(null);

    try {
      if (snapshot.room.team_count > 1 && teamNameDraft.trim()) {
        await updateTeamName(snapshot.room.id, me.id, teamNameDraft);
      }
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

  const handleAddFakePlayers = useCallback(
    async (count: number) => {
      if (!snapshot || !me || !testingEnabled) {
        return;
      }

      setAddingFakePlayers(true);
      setActionError(null);

      try {
        await addFakePlayers(snapshot.room.id, me.id, count);
        await loadSnapshot();
      } catch (issue) {
        setActionError(issue instanceof Error ? issue.message : "Could not add fake users.");
      } finally {
        setAddingFakePlayers(false);
      }
    },
    [loadSnapshot, me, snapshot, testingEnabled],
  );

  const handleKickPlayer = useCallback(
    async (targetPlayerId: string) => {
      if (!snapshot || !me?.is_host || snapshot.room.phase !== "lobby") {
        return;
      }

      setKickingPlayerId(targetPlayerId);
      setActionError(null);

      try {
        await kickPlayer(snapshot.room.id, me.id, targetPlayerId);
        await loadSnapshot();
      } catch (issue) {
        setActionError(issue instanceof Error ? issue.message : "Could not remove player.");
      } finally {
        setKickingPlayerId(null);
      }
    },
    [loadSnapshot, me, snapshot],
  );

  const handleAddHostedPlayer = useCallback(
    async (values: { name: string; color: string; emoji: string }) => {
      if (!snapshot || !me?.is_host || snapshot.room.phase !== "lobby") {
        return;
      }

      setAddingHostedPlayer(true);
      setActionError(null);

      try {
        await addHostedPlayer(snapshot.room.id, me.id, values);
        await loadSnapshot();
      } catch (issue) {
        setActionError(issue instanceof Error ? issue.message : "Could not add player.");
        throw issue;
      } finally {
        setAddingHostedPlayer(false);
      }
    },
    [loadSnapshot, me, snapshot],
  );

  const handleChangeGame = useCallback(
    async (game: GameType) => {
      if (!snapshot || !me || !me.is_host || snapshot.room.phase !== "lobby") {
        return;
      }

      if (game === "sayless") {
        return;
      }

      setChangingGame(game);
      setActionError(null);

      try {
        await switchRoomToWhosDoneIt(
          snapshot.room.id,
          me.id,
          getStoredWhosDoneItHostSettings(),
        );
        window.location.reload();
      } catch (issue) {
        setActionError(issue instanceof Error ? issue.message : "Could not switch games.");
      } finally {
        setChangingGame(null);
      }
    },
    [me, snapshot],
  );

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

  const openRoomSettings = useCallback(() => {
    if (!snapshot) {
      return;
    }

    setSettingsDraft({
      teamCount: snapshot.room.team_count,
      cardsPerPlayer: snapshot.state.cards_per_player,
      roundCount: snapshot.state.round_count,
      turnSeconds: snapshot.state.turn_seconds,
      draftMode: snapshot.state.draft_mode,
      hostPhoneOnly: snapshot.state.host_phone_only,
    });
    setTeamNameDraft(
      typeof me?.team_index === "number" ? getTeamName(snapshot.room, me.team_index) : "",
    );
    setSettingsOpen(true);
  }, [me?.team_index, snapshot]);

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
    if (!snapshot || !draftRoomId || draftPhase !== "drafting") {
      setDraftHand([]);
      setDraftBatchLoading(false);
      setDraftDuplicateCount(0);
      return;
    }

    if (hostPhoneOnly && me?.is_host && !draftPlayerId) {
      setDraftHand([]);
      setDraftBatchLoading(false);
      setDraftDuplicateCount(0);
      return;
    }

    if (!draftPlayerId) {
      setDraftHand([]);
      setDraftBatchLoading(false);
      setDraftDuplicateCount(0);
      return;
    }

    const totalDraftTarget = snapshot.players.length * snapshot.state.cards_per_player;
    const doneDrafting =
      myDraftCount >= snapshot.state.cards_per_player ||
      snapshot.roomCards.length >= totalDraftTarget;

    if (doneDrafting) {
      setDraftHand([]);
      setDraftBatchLoading(false);
      setDraftDuplicateCount(0);
      return;
    }

    if (draftHand.length > 0 || busyAction?.startsWith("draft-")) {
      return;
    }

    let active = true;
    setDraftBatchLoading(true);

    void getDraftBatchForPlayer(draftRoomId, draftPlayerId)
      .then((result: SayLessDraftBatchResponse) => {
        if (!active) {
          return;
        }

        setDraftHand(result.cards);
        setDraftDuplicateCount(result.duplicateCount);
        setDraftBatchLoading(false);
      })
      .catch((issue) => {
        if (!active) {
          return;
        }

        setDraftHand([]);
        setDraftBatchLoading(false);
        setDraftDuplicateCount(0);
        setActionError(issue instanceof Error ? issue.message : "Could not load hand.");
      });

    return () => {
      active = false;
    };
  }, [
    busyAction,
    draftHand.length,
    draftPhase,
    draftPlayerId,
    draftRoomId,
    hostPhoneOnly,
    me?.is_host,
    myDraftCount,
    snapshot,
  ]);

  useEffect(() => {
    if (
      !snapshot ||
      !me?.is_host ||
      !testingEnabled ||
      !hasTestBots ||
      drivingTestBotsRef.current
    ) {
      return;
    }

    const shouldRun =
      snapshot.room.phase === "drafting" ||
      (
        snapshot.room.phase === "playing" &&
        activePlayerIsTestBot &&
        typeof snapshot.state.paused_turn_seconds_remaining !== "number"
      );

    if (!shouldRun) {
      return;
    }

    drivingTestBotsRef.current = true;
    let launched = false;
    const timeoutId = window.setTimeout(() => {
      launched = true;
      void runTestBots(snapshot.room.id, me.id)
        .catch((issue) => {
          setActionError(
            issue instanceof Error ? issue.message : "Could not run fake users.",
          );
        })
        .finally(() => {
          drivingTestBotsRef.current = false;
        });
    }, snapshot.room.phase === "drafting" ? 120 : 260);

    return () => {
      window.clearTimeout(timeoutId);
      if (!launched) {
        drivingTestBotsRef.current = false;
      }
    };
  }, [
    activePlayerIsTestBot,
    hasTestBots,
    me?.id,
    me?.is_host,
    snapshot,
    testingEnabled,
  ]);

  useEffect(() => {
    if (!loading && (error || !snapshot)) {
      router.replace("/");
    }
  }, [error, loading, router, snapshot]);

  useEffect(() => {
    const knownResultIds = new Set((snapshot?.roundResults ?? []).map((result) => result.id));

    if (!snapshot || snapshot.room.phase !== "playing" || !snapshot.state.active_player_id) {
      currentTurnKeyRef.current = null;
      knownRoundResultIdsRef.current = knownResultIds;
      setCurrentTurnSuccessfulCards([]);
      return;
    }

    const currentActivePlayer =
      snapshot.players.find((player) => player.id === snapshot.state.active_player_id) ?? null;

    if (!currentActivePlayer) {
      currentTurnKeyRef.current = null;
      knownRoundResultIdsRef.current = knownResultIds;
      setCurrentTurnSuccessfulCards([]);
      return;
    }

    const activeTeamTurnCount =
      snapshot.state.team_turn_counts[snapshot.state.active_team_index] ?? 0;
    const nextTurnKey = [
      snapshot.state.current_round_index,
      snapshot.state.active_team_index,
      activeTeamTurnCount,
      currentActivePlayer.id,
    ].join(":");

    if (currentTurnKeyRef.current !== nextTurnKey) {
      currentTurnKeyRef.current = nextTurnKey;
      knownRoundResultIdsRef.current = knownResultIds;
      setCurrentTurnSuccessfulCards([]);
      return;
    }

    const newSuccessfulCards = snapshot.roundResults
      .filter(
        (result) =>
          result.round_index === snapshot.state.current_round_index &&
          result.player_id === currentActivePlayer.id &&
          !knownRoundResultIdsRef.current.has(result.id),
      )
      .map((result) => {
        const cardEntry = snapshot.roomCards.find((card) => card.id === result.card_entry_id);
        return {
          id: result.id,
          title: cardEntry?.card.title ?? "Unknown card",
          points: result.points,
        };
      });

    if (newSuccessfulCards.length > 0) {
      setCurrentTurnSuccessfulCards((current) => [...newSuccessfulCards.reverse(), ...current]);
    }

    knownRoundResultIdsRef.current = knownResultIds;
  }, [snapshot]);

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
    return <RoomLoadingScreen message="Joining room..." />;
  }

  const teamSummaries = buildTeamSummaries(snapshot);
  const playerCount = snapshot.players.length;
  const draftedCards = getTotalDraftedCards(playerCount, settingsDraft.cardsPerPlayer);
  const currentRoundNumber = snapshot.state.current_round_index + 1;
  const roundSummaryTeams = buildRoundSummaryTeams(snapshot);
  const canStart = canStartSayLessGame(snapshot);
  const totalDraftTarget = snapshot.players.length * snapshot.state.cards_per_player;
  const doneDrafting =
    myDraftCount >= snapshot.state.cards_per_player ||
    snapshot.roomCards.length >= totalDraftTarget;
  const activePlayer =
    snapshot.players.find((player) => player.id === snapshot.state.active_player_id) ?? null;
  const hostControlsAllTurns = snapshot.state.host_phone_only && me.is_host;
  const meCanControlCurrentTurn = hostControlsAllTurns || me.id === activePlayer?.id;
  const turnPaused =
    typeof snapshot.state.paused_turn_seconds_remaining === "number";
  const optimisticPassedSet = new Set(optimisticPassedCardIds);
  const optimisticClearedSet = new Set(optimisticClearedCardIds);
  const currentTurnCardId =
    optimisticTurnCardId ?? snapshot.state.active_card_entry_id ?? null;
  const activeCard =
    snapshot.roomCards.find((card) => card.id === currentTurnCardId) ?? null;
  const activeTeamName =
    snapshot.room.team_count < 2
      ? "Solo"
      : typeof activePlayer?.team_index === "number"
      ? getTeamName(snapshot.room, activePlayer.team_index)
      : "No team";
  const activeTeamColor =
    snapshot.room.team_count < 2
      ? (activePlayer?.color ?? "#0f172a")
      : typeof activePlayer?.team_index === "number"
      ? (SAY_LESS_TEAM_PALETTE[activePlayer.team_index]?.color ?? "#0f172a")
      : "#0f172a";
  const activeTeamBackground =
    snapshot.room.team_count < 2
      ? "#f8fafc"
      : typeof activePlayer?.team_index === "number"
      ? (SAY_LESS_TEAM_PALETTE[activePlayer.team_index]?.background ?? "#f8fafc")
      : "#f8fafc";
  const turnStarted = Boolean(
    activeCard &&
      (
        snapshot.state.turn_deadline_at ||
        typeof snapshot.state.paused_turn_seconds_remaining === "number" ||
        optimisticTurnCardId
      ),
  );
  const remainingCards = isDraftless
    ? 0
    : snapshot.roomCards.filter(
        (card) =>
          getEffectiveCardStatus(card, optimisticPassedSet, optimisticClearedSet) !== "cleared",
      ).length;
  const allowHostControls = me.is_host && snapshot.room.phase === "lobby";
  const playStageBusy = Boolean(busyAction) || pendingTurnActions > 0;
  const isLobby = snapshot.room.phase === "lobby";
  const showTopBar = isLobby || Boolean(actionError);

  return (
    <main className="app-page">
      <div className="app-page-card app-page-card-mobile-fill relative flex h-[100svh] max-h-[100svh] flex-col overflow-hidden sm:h-[80vh] sm:max-h-[80vh]">
        <AppBanner
          label={GAME?.name}
          leftAction={{
            label: "Go home",
            icon: "home",
            onClick: () => router.push("/"),
          }}
          rightAction={
            isLobby
              ? {
                  label: "Game info",
                  icon: "info",
                  onClick: () => setInfoOpen(true),
                }
              : undefined
          }
          rightContent={
            isLobby ? undefined : (
              <RoomHeaderMenu
                codeCopied={linkCopied}
                onCopyRoomLink={handleCopyRoomLink}
                onOpenInfo={() => setInfoOpen(true)}
                onOpenProfile={openProfileSettings}
                onOpenSettings={openRoomSettings}
                roomCode={snapshot.room.code}
                settingsHint={me.is_host ? "Room and team controls" : "Team name and room details"}
              />
            )
          }
        />

        <div className="flex min-h-0 flex-1 flex-col gap-2 pt-2">
          {showTopBar ? (
            <section className="-mx-[var(--card-padding)] border-b border-slate-200 bg-white px-[var(--card-padding)] pb-2">
              {isLobby ? (
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
                    <button
                      aria-label="Profile settings"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                      onClick={openProfileSettings}
                      type="button"
                    >
                      <EditIcon />
                    </button>
                    <button
                      aria-label="Room settings"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                      onClick={openRoomSettings}
                      type="button"
                    >
                      <SettingsIcon />
                    </button>
                  </div>
                </div>
              ) : null}

              {actionError ? (
                <p
                  className={`rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 ${
                    isLobby ? "mt-3" : ""
                  }`}
                >
                  {actionError}
                </p>
              ) : null}
            </section>
          ) : null}

          {snapshot.room.phase === "lobby" ? (
            <LobbyStage
              busy={Boolean(busyAction)}
              canStart={canStart}
              hostPlayer={hostPlayer}
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
              draftingLabel={
                hostPhoneOnly && me.is_host && draftPlayerId
                  ? `${snapshot.players.find((player) => player.id === draftPlayerId)?.name ?? "Player"} picks`
                  : hostPhoneOnly && me.is_host
                  ? "Choose player"
                  : "Your picks"
              }
              duplicateCount={draftDuplicateCount}
              loadingCard={draftBatchLoading}
              onSelectPlayer={setHostDraftPlayerId}
              onKeep={() =>
                runAction("draft-keep", async () => {
                  if (!draftCard || !draftPlayerId) {
                    return;
                  }

                  const wasLastCardInHand = draftHand.length <= 1;
                  try {
                    await submitDraftDecision(snapshot.room.id, draftPlayerId, draftCard.id, true);
                  } catch (issue) {
                    setDraftHand([]);
                    await loadSnapshot();
                    throw issue;
                  }
                  setDraftHand((current) =>
                    current.filter((card) => card.id !== draftCard.id),
                  );
                  if (wasLastCardInHand) {
                    setDraftBatchLoading(true);
                  }
                  if ((draftCounts.get(draftPlayerId) ?? 0) + 1 >= snapshot.state.cards_per_player) {
                    setHostDraftPlayerId(null);
                  }
                })
              }
              onSkip={() =>
                runAction("draft-skip", async () => {
                  if (!draftCard || !draftPlayerId) {
                    return;
                  }

                  const wasLastCardInHand = draftHand.length <= 1;
                  try {
                    await submitDraftDecision(snapshot.room.id, draftPlayerId, draftCard.id, false);
                  } catch (issue) {
                    setDraftHand([]);
                    await loadSnapshot();
                    throw issue;
                  }
                  setDraftHand((current) =>
                    current.filter((card) => card.id !== draftCard.id),
                  );
                  if (wasLastCardInHand) {
                    setDraftBatchLoading(true);
                  }
                })
              }
              selectablePlayers={hostPhoneOnly && me.is_host ? draftablePlayers : []}
              selectedPlayerName={
                hostPhoneOnly && me.is_host
                  ? (draftPlayerId
                      ? (snapshot.players.find((player) => player.id === draftPlayerId)?.name ?? null)
                      : null)
                  : "Self"
              }
              targetCount={snapshot.state.cards_per_player}
              totalDrafted={snapshot.roomCards.length}
              totalTarget={totalDraftTarget}
            />
          ) : null}

          {snapshot.room.phase === "playing" ? (
            <PlayingStage
              activePlayer={activePlayer}
              activeTeamBackground={activeTeamBackground}
              activeTeamColor={activeTeamColor}
              activeTeamName={activeTeamName}
              busy={playStageBusy}
              card={meCanControlCurrentTurn ? activeCard : null}
              deadlineAt={snapshot.state.turn_deadline_at}
              infiniteCards={isDraftless}
              isHost={me.is_host}
              meIsActive={meCanControlCurrentTurn}
              onStartTurn={() =>
                runAction("start-turn", async () => {
                  clearOptimisticTurn();
                  await startPlayerTurn(snapshot.room.id, me.id);
                })
              }
              onSkipTurn={() =>
                runAction("skip-turn", async () => {
                  await skipTurn(snapshot.room.id, me.id);
                })
              }
              onTogglePause={() =>
                runAction("toggle-turn-pause", async () => {
                  await toggleTurnPause(snapshot.room.id, me.id);
                })
              }
              onCorrect={() => queueTurnAction("correct")}
              onPass={() => queueTurnAction("pass")}
              pausedRemainingSeconds={snapshot.state.paused_turn_seconds_remaining}
              remainingCards={remainingCards}
              roundCount={snapshot.state.round_count}
              roundNumber={currentRoundNumber}
              successfulCards={currentTurnSuccessfulCards}
              totalCards={snapshot.roomCards.length}
              turnPaused={turnPaused}
              turnStarted={turnStarted}
            />
          ) : null}

          {snapshot.room.phase === "round_summary" ? (
            <RoundSummaryStage
              busy={Boolean(busyAction)}
              hostPlayer={hostPlayer}
              isHost={me.is_host}
              isTeamless={isTeamless}
              onContinue={() =>
                runAction("continue", async () => {
                  await continueFromRoundSummary(snapshot.room.id, me.id);
                })
              }
              roundCount={snapshot.state.round_count}
              roundNumber={currentRoundNumber}
              summaries={roundSummaryTeams}
            />
          ) : null}

          {snapshot.room.phase === "finished" ? (
            <FinishedStage
              busy={Boolean(busyAction)}
              hostPlayer={hostPlayer}
              isHost={me.is_host}
              isTeamless={isTeamless}
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
          addingFakePlayers={addingFakePlayers}
          addingHostedPlayer={addingHostedPlayer}
          allowTesting={testingEnabled}
          allowFakePlayers={allowHostControls}
          allowHostControls={allowHostControls}
          allowKickPlayers={allowHostControls}
          cardsPerPlayer={settingsDraft.cardsPerPlayer}
          changingGame={changingGame}
          currentGame="sayless"
          currentPlayerId={me.id}
          draftedCards={draftedCards}
          draftMode={settingsDraft.draftMode}
          hostPhoneOnly={settingsDraft.hostPhoneOnly}
          isHost={me.is_host}
          kickingPlayerId={kickingPlayerId}
          onAddFakePlayers={handleAddFakePlayers}
          onAddHostedPlayer={handleAddHostedPlayer}
          onCardsPerPlayerChange={(cardsPerPlayer) =>
            setSettingsDraft((current) => ({ ...current, cardsPerPlayer }))
          }
          onDraftedCardsChange={(nextDraftedCards) =>
            setSettingsDraft((current) => ({
              ...current,
              cardsPerPlayer: getCardsPerPlayerForDraftedCards(playerCount, nextDraftedCards),
            }))
          }
          onDraftModeChange={(draftMode) =>
            setSettingsDraft((current) => ({ ...current, draftMode }))
          }
          onGameChange={handleChangeGame}
          onHostPhoneOnlyChange={(hostPhoneOnly) =>
            setSettingsDraft((current) => ({ ...current, hostPhoneOnly }))
          }
          onKickPlayer={handleKickPlayer}
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
          playerCount={playerCount}
          players={snapshot.players}
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

        <GameInfoSheet
          onClose={() => setInfoOpen(false)}
          open={infoOpen}
          steps={[
            "Each player drafts cards into the shared deck before play begins.",
            "On your turn, describe the current card without saying the answer.",
            "Teammates call it out while the timer runs and cards keep moving.",
            "Rounds continue until the deck is cleared, then scores roll into the next round.",
          ]}
          summary="Say Less is a fast team clue game. Draft the deck, race the turn timer, and clear as many cards as your team can before time runs out."
          tips={[
            "Short clues beat clever clues when the timer is moving.",
            "Rename teams and tune settings in the room controls before the game starts.",
          ]}
          title="How To Play"
        />
      </div>
    </main>
  );
}
