import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { seedDatabase } from "../data/seedData";
import {
  buildAppSnapshot,
  fetchAppSnapshot,
  getSupabaseSession,
  isValidAppSnapshotEnvelope,
  mergeAppSnapshots,
  signInWithEmail,
  signOutSupabase,
  signUpWithEmail,
  subscribeToSupabaseAuth,
  summarizeSnapshot,
  upsertAppSnapshot,
  type SnapshotSummary,
} from "../lib/cloudSync";
import {
  bindDatabaseToIdentity,
  loadDatabase,
  loadStoredDatabase,
  replaceDatabase,
  resetDatabase,
  saveDatabase,
  type DatabaseStorageScope,
} from "../lib/db";
import { getSupabaseConfigError, isSupabaseConfigured } from "../lib/supabaseClient";
import type { TrainingDatabase } from "../types/domain";

type SyncPhase = "disabled" | "not-signed-in" | "hydrating" | "syncing" | "synced" | "failed";

export type AuthMode = "unknown" | "local" | "cloud";
export type CloudImportAction = "merge" | "replace";

interface CloudSyncState {
  configured: boolean;
  session: Session | null;
  status: SyncPhase;
  message: string;
  lastSyncedAt?: string;
  lastError?: string;
}

const AUTO_SYNC_DELAY_MS = 3000;
const LOCAL_SCOPE: DatabaseStorageScope = { mode: "local-only" };
const LOGGER_SYNC_DEBUG = false;

function canUseWindow(): boolean {
  return typeof window !== "undefined";
}

function shouldDebugSync(): boolean {
  if (!canUseWindow()) return false;
  try {
    return window.localStorage.getItem("iron-orbit-sync-debug") === "1";
  } catch {
    return false;
  }
}

function logSync(event: string, detail?: Record<string, unknown>) {
  if (!shouldDebugSync()) return;
  console.info(`[sync] ${event}`, detail || {});
}

function logLoggerSync(event: string, detail?: Record<string, unknown>) {
  if (!LOGGER_SYNC_DEBUG) return;
  console.info(`[logger-sync] ${event}`, detail || {});
}

function parseTimestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isSeedLikeDatabase(database?: TrainingDatabase): boolean {
  if (!database) return true;
  const hasPrograms = database.programs.length > 0;
  const hasCustomExercises = database.exercises.some((exercise) => "ownerUserId" in exercise && exercise.ownerUserId);
  const hasUserGyms = database.gyms.some((gym) => gym.userId && !gym.id.endsWith("_gym_commercial"));
  const hasMultipleSessions = database.sessions.length > 1;
  return database.users.length <= 1 && !hasPrograms && !hasCustomExercises && !hasUserGyms && !hasMultipleSessions;
}

function getCloudScope(userId: string): DatabaseStorageScope {
  return { mode: "cloud-cache", supabaseUserId: userId };
}

export function useTrainingDb() {
  const [db, setDb] = useState<TrainingDatabase | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [authMode, setAuthMode] = useState<AuthMode>("unknown");
  const [localOnlySummary, setLocalOnlySummary] = useState<SnapshotSummary | undefined>();
  const [hasMeaningfulLocalOnlyData, setHasMeaningfulLocalOnlyData] = useState(false);
  const [cloud, setCloud] = useState<CloudSyncState>({
    configured: isSupabaseConfigured,
    session: null,
    status: isSupabaseConfigured ? "not-signed-in" : "disabled",
    message: isSupabaseConfigured ? "Local only — saved on this device until you sign in." : getSupabaseConfigError() || "Cloud sync disabled.",
  });

  const dbRef = useRef<TrainingDatabase | undefined>(undefined);
  const localOnlyDbRef = useRef<TrainingDatabase | undefined>(undefined);
  const authModeRef = useRef<AuthMode>("unknown");
  const sessionRef = useRef<Session | null>(null);
  const pendingCloudSaveRef = useRef<number | undefined>(undefined);
  const pendingSerializedSnapshotRef = useRef<string | undefined>(undefined);
  const isHydratingFromCloudRef = useRef(false);
  const hasHydratedFromCloudRef = useRef(false);
  const isSavingToCloudRef = useRef(false);
  const lastSavedSerializedSnapshotRef = useRef<string | undefined>(undefined);
  const latestLocalMutationSeqRef = useRef(0);
  const latestAppliedPersistSeqRef = useRef(0);
  const pendingLocalMutationCountRef = useRef(0);
  const lastLocalMutationAtRef = useRef<string | undefined>(undefined);
  const persistChainRef = useRef<Promise<void>>(Promise.resolve());

  const updateCloudState = useCallback((patch: Partial<CloudSyncState>) => {
    setCloud((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  useEffect(() => {
    authModeRef.current = authMode;
  }, [authMode]);

  const currentCloudScope = useCallback((): DatabaseStorageScope | undefined => {
    const userId = sessionRef.current?.user.id;
    return userId ? getCloudScope(userId) : undefined;
  }, []);

  const refreshLocalOnlySummary = useCallback((database?: TrainingDatabase) => {
    localOnlyDbRef.current = database;
    const meaningful = !!database && !isSeedLikeDatabase(database);
    setHasMeaningfulLocalOnlyData(meaningful);
    setLocalOnlySummary(database ? summarizeSnapshot(buildAppSnapshot(database)) : undefined);
  }, []);

  const clearPendingCloudSave = useCallback(() => {
    if (pendingCloudSaveRef.current !== undefined && canUseWindow()) {
      window.clearTimeout(pendingCloudSaveRef.current);
    }
    pendingCloudSaveRef.current = undefined;
    pendingSerializedSnapshotRef.current = undefined;
  }, []);

  const applyDbToState = useCallback((next: TrainingDatabase) => {
    dbRef.current = next;
    setDb(next);
  }, []);

  const signedOutMessage = isSupabaseConfigured
    ? "Local only — saved on this device. Sign in to sync across devices."
    : getSupabaseConfigError() || "Cloud sync disabled.";

  const saveForScope = useCallback(async (
    scope: DatabaseStorageScope,
    next: TrainingDatabase,
    options?: { preserveUpdatedAt?: boolean }
  ) => {
    const saved = await saveDatabase(scope, next, { preserveUpdatedAt: options?.preserveUpdatedAt });
    if (scope.mode === "local-only") {
      refreshLocalOnlySummary(saved);
    }
    return saved;
  }, [refreshLocalOnlySummary]);

  const pushSnapshotToCloud = useCallback(async (database: TrainingDatabase, reason: "auto" | "manual" | "import"): Promise<boolean> => {
    const session = sessionRef.current;
    if (!isSupabaseConfigured) {
      updateCloudState({
        status: "disabled",
        message: getSupabaseConfigError() || "Cloud sync disabled.",
      });
      return false;
    }
    if (!session || authModeRef.current !== "cloud") {
      updateCloudState({
        status: "not-signed-in",
        message: signedOutMessage,
      });
      return false;
    }
    if (isHydratingFromCloudRef.current) {
      logSync("save-skipped-hydrating", { reason });
      return false;
    }

    const snapshot = buildAppSnapshot(database);
    const serialized = JSON.stringify(snapshot);
    if (reason === "auto" && serialized === lastSavedSerializedSnapshotRef.current) {
      logSync("save-skipped-unchanged", { reason, updatedAt: snapshot.updatedAt });
      return true;
    }

    isSavingToCloudRef.current = true;
    updateCloudState({
      status: "syncing",
      message: reason === "manual" ? "Syncing current cloud account data..." : "Saving cloud account data...",
      lastError: undefined,
    });

    try {
      const row = await upsertAppSnapshot(session.user.id, snapshot);
      lastSavedSerializedSnapshotRef.current = serialized;
      pendingSerializedSnapshotRef.current = undefined;
      updateCloudState({
        status: "synced",
        message: "Synced.",
        lastSyncedAt: row.updated_at,
        lastError: undefined,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Cloud sync failed.";
      updateCloudState({
        status: "failed",
        message: "Sync failed.",
        lastError: message,
      });
      return false;
    } finally {
      isSavingToCloudRef.current = false;
    }
  }, [signedOutMessage, updateCloudState]);

  const persistDb = useCallback(async (
    next: TrainingDatabase,
    options?: { preserveUpdatedAt?: boolean; scheduleCloud?: boolean; reason?: string; mutationSeq?: number }
  ) => {
    const scope = authModeRef.current === "cloud"
      ? currentCloudScope()
      : LOCAL_SCOPE;
    if (!scope) {
      throw new Error("Cloud account mode is missing a signed-in user.");
    }

    const identity = scope.mode === "cloud-cache" && sessionRef.current
      ? { mode: "supabase" as const, supabaseUserId: sessionRef.current.user.id, email: sessionRef.current.user.email }
      : { mode: "local" as const };
    logLoggerSync("PERSIST_START", {
      reason: options?.reason || "local-mutation",
      mutationSeq: options?.mutationSeq,
      source: scope.mode === "cloud-cache" ? "cloud-cache" : "local-storage",
      updatedAt: next.updatedAt,
      pendingLocalMutations: pendingLocalMutationCountRef.current,
      sessionCount: next.sessions.length,
    });
    const saved = await saveForScope(scope, bindDatabaseToIdentity(next, identity), { preserveUpdatedAt: options?.preserveUpdatedAt });
    logLoggerSync("PERSIST_SUCCESS", {
      reason: options?.reason || "local-mutation",
      mutationSeq: options?.mutationSeq,
      source: scope.mode === "cloud-cache" ? "cloud-cache" : "local-storage",
      updatedAt: saved.updatedAt,
      pendingLocalMutations: pendingLocalMutationCountRef.current,
      sessionCount: saved.sessions.length,
    });
    if (options?.scheduleCloud && scope.mode === "cloud-cache") {
      const snapshot = buildAppSnapshot(saved);
      const serialized = JSON.stringify(snapshot);
      if (serialized !== lastSavedSerializedSnapshotRef.current && serialized !== pendingSerializedSnapshotRef.current) {
        clearPendingCloudSave();
        pendingSerializedSnapshotRef.current = serialized;
        updateCloudState({
          status: "syncing",
          message: "Syncing soon...",
          lastError: undefined,
        });
        logSync("schedule-save", { reason: options.reason || "local-mutation", updatedAt: snapshot.updatedAt });
        if (canUseWindow()) {
          pendingCloudSaveRef.current = window.setTimeout(() => {
            clearPendingCloudSave();
            const latest = dbRef.current;
            if (latest && authModeRef.current === "cloud") {
              void pushSnapshotToCloud(latest, "auto");
            }
          }, AUTO_SYNC_DELAY_MS);
        }
      }
    }
    return saved;
  }, [clearPendingCloudSave, currentCloudScope, pushSnapshotToCloud, saveForScope, updateCloudState]);

  const hydrateCloudMode = useCallback(async (session: Session, reason: "initial-session" | "signed-in") => {
    const scope = getCloudScope(session.user.id);
    const cached = await loadStoredDatabase(scope);
    const cachedBound = cached
      ? bindDatabaseToIdentity(cached, { mode: "supabase", supabaseUserId: session.user.id, email: session.user.email })
      : undefined;

    clearPendingCloudSave();
    isHydratingFromCloudRef.current = true;
    updateCloudState({
      configured: true,
      session,
      status: "hydrating",
      message: "Loading cloud account data...",
      lastError: undefined,
    });
    logSync("hydrate-start", { reason, userId: session.user.id });
    logLoggerSync("HYDRATE_FROM_STORAGE", {
      source: "cloud-cache",
      reason,
      userId: session.user.id,
      cachedUpdatedAt: cachedBound?.updatedAt,
      inMemoryUpdatedAt: dbRef.current?.updatedAt,
      pendingLocalMutations: pendingLocalMutationCountRef.current,
    });

    try {
      const remote = await fetchAppSnapshot(session.user.id);
      if (remote && isValidAppSnapshotEnvelope(remote.data)) {
        const remoteBound = bindDatabaseToIdentity(remote.data.data, {
          mode: "supabase",
          supabaseUserId: session.user.id,
          email: session.user.email,
        });
        // Merge rather than blindly overwrite: the on-device cache can hold workout progress
        // (e.g. a set completed seconds before the tab was backgrounded/reloaded) that never
        // reached the server because the auto-sync push is debounced. mergeAppSnapshots picks
        // the newer side per entity (by updatedAt), so a fresher local session always wins over
        // a stale remote one instead of being silently discarded on re-hydrate.
        const mergedData = cachedBound
          ? mergeAppSnapshots(buildAppSnapshot(cachedBound), buildAppSnapshot(remoteBound)).data
          : remoteBound;
        logLoggerSync("HYDRATE_FROM_SUPABASE", {
          source: "supabase-read",
          reason,
          userId: session.user.id,
          remoteUpdatedAt: remote.updated_at,
          remoteEnvelopeUpdatedAt: remote.data.updatedAt,
          cachedUpdatedAt: cachedBound?.updatedAt,
          inMemoryUpdatedAt: dbRef.current?.updatedAt,
          pendingLocalMutations: pendingLocalMutationCountRef.current,
        });
        const saved = await replaceDatabase(scope, mergedData, { preserveUpdatedAt: true });
        applyDbToState(saved);
        lastSavedSerializedSnapshotRef.current = JSON.stringify(buildAppSnapshot(saved));
        hasHydratedFromCloudRef.current = true;
        setAuthMode("cloud");
        updateCloudState({
          configured: true,
          session,
          status: "synced",
          message: "Loaded cloud account data.",
          lastSyncedAt: remote.updated_at,
          lastError: undefined,
        });
        return;
      }

      if (remote && !isValidAppSnapshotEnvelope(remote.data)) {
        const fallback = cachedBound || bindDatabaseToIdentity(await seedDatabase(), {
          mode: "supabase",
          supabaseUserId: session.user.id,
          email: session.user.email,
        });
        const saved = await replaceDatabase(scope, fallback, { preserveUpdatedAt: true });
        applyDbToState(saved);
        lastSavedSerializedSnapshotRef.current = JSON.stringify(buildAppSnapshot(saved));
        hasHydratedFromCloudRef.current = true;
        setAuthMode("cloud");
        updateCloudState({
          configured: true,
          session,
          status: "failed",
          message: "Cloud snapshot was malformed. Using cloud account cache on this device.",
          lastError: "Cloud snapshot is malformed.",
        });
        return;
      }

      const fallback = cachedBound || bindDatabaseToIdentity(await seedDatabase(), {
        mode: "supabase",
        supabaseUserId: session.user.id,
        email: session.user.email,
      });
      const saved = await replaceDatabase(scope, fallback, { preserveUpdatedAt: true });
      applyDbToState(saved);
      lastSavedSerializedSnapshotRef.current = undefined;
      hasHydratedFromCloudRef.current = true;
      setAuthMode("cloud");
      updateCloudState({
        configured: true,
        session,
        status: "synced",
        message: "No cloud snapshot yet. This cloud account is separate until you sync changes or explicitly import local-only data.",
        lastError: undefined,
      });
    } catch (err) {
      console.error("Failed to hydrate cloud mode.", err);
      const message = err instanceof Error ? err.message : "Could not load the cloud snapshot.";
      const fallback = cachedBound || bindDatabaseToIdentity(await seedDatabase(), {
        mode: "supabase",
        supabaseUserId: session.user.id,
        email: session.user.email,
      });
      const saved = await replaceDatabase(scope, fallback, { preserveUpdatedAt: true });
      applyDbToState(saved);
      hasHydratedFromCloudRef.current = true;
      setAuthMode("cloud");
      updateCloudState({
        configured: true,
        session,
        status: "failed",
        message: "Could not load the cloud snapshot. Using this account's device cache for now.",
        lastError: message,
      });
    } finally {
      isHydratingFromCloudRef.current = false;
    }
  }, [applyDbToState, clearPendingCloudSave, updateCloudState]);

  const handleAuthEvent = useCallback(async (event: AuthChangeEvent, session: Session | null) => {
    sessionRef.current = session;
    logSync("auth-event", { event, userId: session?.user.id });

    if (!isSupabaseConfigured) {
      updateCloudState({
        configured: false,
        session: null,
        status: "disabled",
        message: getSupabaseConfigError() || "Cloud sync disabled.",
      });
      return;
    }

    if (event === "SIGNED_OUT" || !session) {
      clearPendingCloudSave();
      isHydratingFromCloudRef.current = false;
      isSavingToCloudRef.current = false;
      hasHydratedFromCloudRef.current = false;
      lastSavedSerializedSnapshotRef.current = undefined;
      setAuthMode("unknown");
      updateCloudState({
        configured: true,
        session: null,
        status: "not-signed-in",
        message: signedOutMessage,
        lastError: undefined,
      });
      return;
    }

    if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED" || event === "PASSWORD_RECOVERY") {
      updateCloudState({ configured: true, session });
      return;
    }

    if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
      await hydrateCloudMode(session, event === "INITIAL_SESSION" ? "initial-session" : "signed-in");
    }
  }, [clearPendingCloudSave, hydrateCloudMode, signedOutMessage, updateCloudState]);

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | undefined;

    async function init() {
      try {
        const localOnly = await loadDatabase(LOCAL_SCOPE, { seedIfMissing: true });
        if (cancelled) return;
        refreshLocalOnlySummary(bindDatabaseToIdentity(localOnly, { mode: "local" }));

        if (!isSupabaseConfigured) {
          setAuthMode("unknown");
          updateCloudState({
            configured: false,
            session: null,
            status: "disabled",
            message: getSupabaseConfigError() || "Cloud sync disabled.",
          });
          return;
        }

        const session = await getSupabaseSession();
        if (cancelled) return;
        if (session) {
          await handleAuthEvent("INITIAL_SESSION", session);
        } else {
          setAuthMode("unknown");
          updateCloudState({
            configured: true,
            session: null,
            status: "not-signed-in",
            message: "Choose local-only mode or sign in to sync across devices.",
            lastError: undefined,
          });
        }
      } catch (err) {
        console.error("Failed to initialize training database state.", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load local database.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }

      if (!isSupabaseConfigured || cancelled) return;
      subscription = subscribeToSupabaseAuth((event, session) => {
        if (cancelled) return;
        void handleAuthEvent(event, session);
      });
    }

    void init();

    return () => {
      cancelled = true;
      clearPendingCloudSave();
      subscription?.unsubscribe();
    };
  }, [clearPendingCloudSave, handleAuthEvent, refreshLocalOnlySummary, updateCloudState]);

  // Mobile browsers/PWAs can background, suspend, or evict a tab at any moment. The auto cloud
  // sync push is debounced (AUTO_SYNC_DELAY_MS) so a quick tab/app switch can outrace it, leaving
  // the server snapshot stale until the next local mutation. Flush any pending push immediately
  // once the page starts hiding so the debounce window can't cause a lost sync.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const flushPendingCloudSave = () => {
      if (pendingCloudSaveRef.current === undefined) return;
      clearPendingCloudSave();
      const latest = dbRef.current;
      if (latest && authModeRef.current === "cloud") {
        void pushSnapshotToCloud(latest, "auto");
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushPendingCloudSave();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", flushPendingCloudSave);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", flushPendingCloudSave);
    };
  }, [clearPendingCloudSave, pushSnapshotToCloud]);

  const continueLocalOnly = useCallback(async () => {
    try {
      const localOnly = localOnlyDbRef.current || await loadDatabase(LOCAL_SCOPE, { seedIfMissing: true });
      const bound = bindDatabaseToIdentity(localOnly, { mode: "local" });
      applyDbToState(bound);
      refreshLocalOnlySummary(bound);
      setAuthMode("local");
      updateCloudState({
        configured: isSupabaseConfigured,
        session: null,
        status: isSupabaseConfigured ? "not-signed-in" : "disabled",
        message: signedOutMessage,
        lastError: undefined,
      });
    } catch (err) {
      console.error("Failed to enter local-only mode.", err);
      setError(err instanceof Error ? err.message : "Unable to open local-only mode.");
    }
  }, [applyDbToState, refreshLocalOnlySummary, signedOutMessage, updateCloudState]);

  useEffect(() => {
    let cancelled = false;

    async function ensureModeDatabase() {
      try {
        if (authMode === "local" && !dbRef.current) {
          const localOnly = localOnlyDbRef.current || await loadDatabase(LOCAL_SCOPE, { seedIfMissing: true });
          if (cancelled) return;
          const bound = bindDatabaseToIdentity(localOnly, { mode: "local" });
          applyDbToState(bound);
          refreshLocalOnlySummary(bound);
          return;
        }

        if (authMode === "cloud" && !dbRef.current && sessionRef.current) {
          const scope = getCloudScope(sessionRef.current.user.id);
          const cached = await loadStoredDatabase(scope);
          const fallback = bindDatabaseToIdentity(
            cached || await seedDatabase(),
            { mode: "supabase", supabaseUserId: sessionRef.current.user.id, email: sessionRef.current.user.email }
          );
          const saved = await replaceDatabase(scope, fallback, { preserveUpdatedAt: true });
          if (cancelled) return;
          applyDbToState(saved);
        }
      } catch (err) {
        console.error("Failed to prepare database for selected mode.", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to prepare the selected workspace.");
        }
      }
    }

    if ((authMode === "local" || authMode === "cloud") && !db) {
      void ensureModeDatabase();
    }

    return () => {
      cancelled = true;
    };
  }, [authMode, db, applyDbToState, refreshLocalOnlySummary]);

  const updateDb = useCallback(async (updater: (draft: TrainingDatabase) => TrainingDatabase) => {
    if (!dbRef.current) return;
    const base = dbRef.current;
    const next = updater(structuredClone(base));
    const baseSerialized = JSON.stringify(base);
    const nextSerialized = JSON.stringify(next);
    if (baseSerialized === nextSerialized) {
      logLoggerSync("SKIP_REMOTE_BECAUSE_LOCAL_DIRTY", {
        reason: "unchanged-local-update",
        updatedAt: base.updatedAt,
        pendingLocalMutations: pendingLocalMutationCountRef.current,
      });
      return;
    }

    const optimisticUpdatedAt = new Date().toISOString();
    next.updatedAt = optimisticUpdatedAt;
    const mutationSeq = latestLocalMutationSeqRef.current + 1;
    latestLocalMutationSeqRef.current = mutationSeq;
    pendingLocalMutationCountRef.current += 1;
    lastLocalMutationAtRef.current = optimisticUpdatedAt;

    logLoggerSync("LOCAL_ACTION_START", {
      mutationSeq,
      updatedAt: optimisticUpdatedAt,
      pendingLocalMutations: pendingLocalMutationCountRef.current,
      sessionCount: next.sessions.length,
      source: "local-action",
    });

    applyDbToState(next);
    logLoggerSync("LOCAL_ACTION_END", {
      mutationSeq,
      updatedAt: optimisticUpdatedAt,
      pendingLocalMutations: pendingLocalMutationCountRef.current,
      sessionCount: next.sessions.length,
      source: "local-action",
    });

    persistChainRef.current = persistChainRef.current.then(async () => {
      try {
        const saved = await persistDb(next, {
          preserveUpdatedAt: true,
          scheduleCloud: true,
          reason: "local-update",
          mutationSeq,
        });
        if (mutationSeq === latestLocalMutationSeqRef.current) {
          latestAppliedPersistSeqRef.current = mutationSeq;
          applyDbToState(saved);
          logLoggerSync("ACTIVE_WORKOUT_REPLACED", {
            mutationSeq,
            updatedAt: saved.updatedAt,
            source: "persist-success-latest",
          });
        } else {
          logLoggerSync("APPLY_REMOTE_WORKOUT", {
            mutationSeq,
            updatedAt: saved.updatedAt,
            source: "persist-success-stale-skip",
            latestMutationSeq: latestLocalMutationSeqRef.current,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to persist local workout state.";
        setError(message);
        logLoggerSync("PERSIST_ERROR", {
          mutationSeq,
          message,
          pendingLocalMutations: pendingLocalMutationCountRef.current,
        });
      } finally {
        pendingLocalMutationCountRef.current = Math.max(0, pendingLocalMutationCountRef.current - 1);
      }
    });

    await persistChainRef.current;
  }, [persistDb]);

  const importDb = useCallback(async (next: TrainingDatabase) => {
    await persistDb(next, { preserveUpdatedAt: true, scheduleCloud: true, reason: "import" });
  }, [persistDb]);

  const reseed = useCallback(async () => {
    const scope = authModeRef.current === "cloud"
      ? currentCloudScope()
      : LOCAL_SCOPE;
    if (!scope) return;
    const next = await resetDatabase(scope);
    const rebound = scope.mode === "cloud-cache" && sessionRef.current
      ? bindDatabaseToIdentity(next, { mode: "supabase", supabaseUserId: sessionRef.current.user.id, email: sessionRef.current.user.email })
      : bindDatabaseToIdentity(next, { mode: "local" });
    const saved = await replaceDatabase(scope, rebound, { preserveUpdatedAt: true });
    applyDbToState(saved);
    if (scope.mode === "local-only") {
      refreshLocalOnlySummary(saved);
    }
    if (scope.mode === "cloud-cache") {
      lastSavedSerializedSnapshotRef.current = undefined;
    }
  }, [applyDbToState, currentCloudScope, refreshLocalOnlySummary]);

  const currentUser = useMemo(() => {
    if (!db) return undefined;
    return db.users.find((user) => user.id === db.currentUserId) || db.users[0];
  }, [db]);

  const signUp = useCallback(async (email: string, password: string) => {
    updateCloudState({
      status: "syncing",
      message: "Creating account...",
      lastError: undefined,
    });
    const result = await signUpWithEmail(email, password);
    if (!result.session) {
      updateCloudState({
        configured: true,
        session: null,
        status: "not-signed-in",
        message: "Check your email to confirm your account before signing in.",
        lastError: undefined,
      });
    }
    return result;
  }, [updateCloudState]);

  const signIn = useCallback(async (email: string, password: string) => {
    updateCloudState({
      status: "syncing",
      message: "Signing in...",
      lastError: undefined,
    });
    return signInWithEmail(email, password);
  }, [updateCloudState]);

  const signOut = useCallback(async () => {
    clearPendingCloudSave();
    await signOutSupabase();
  }, [clearPendingCloudSave]);

  const syncNow = useCallback(async () => {
    clearPendingCloudSave();
    const latest = dbRef.current;
    if (!latest || authModeRef.current !== "cloud") return false;
    return pushSnapshotToCloud(latest, "manual");
  }, [clearPendingCloudSave, pushSnapshotToCloud]);

  const importLocalIntoCloud = useCallback(async (action: CloudImportAction) => {
    if (authModeRef.current !== "cloud" || !sessionRef.current) return false;
    const localOnly = localOnlyDbRef.current;
    const currentCloud = dbRef.current;
    if (!localOnly || !currentCloud) return false;

    const localBound = bindDatabaseToIdentity(localOnly, {
      mode: "supabase",
      supabaseUserId: sessionRef.current.user.id,
      email: sessionRef.current.user.email,
    });
    const cloudBound = bindDatabaseToIdentity(currentCloud, {
      mode: "supabase",
      supabaseUserId: sessionRef.current.user.id,
      email: sessionRef.current.user.email,
    });
    const next = action === "replace"
      ? localBound
      : mergeAppSnapshots(buildAppSnapshot(localBound), buildAppSnapshot(cloudBound)).data;

    const scope = currentCloudScope();
    if (!scope) return false;
    const saved = await replaceDatabase(scope, next, { preserveUpdatedAt: true });
    applyDbToState(saved);
    lastSavedSerializedSnapshotRef.current = undefined;
    return pushSnapshotToCloud(saved, "import");
  }, [applyDbToState, currentCloudScope, pushSnapshotToCloud]);

  return {
    db,
    currentUser,
    loading,
    error,
    authMode,
    updateDb,
    importDb,
    reseed,
    setDb,
    cloud: {
      ...cloud,
      authMode,
      userEmail: cloud.session?.user.email,
      localOnlySummary,
      hasMeaningfulLocalOnlyData,
      continueLocalOnly,
      importLocalIntoCloud,
      syncNow,
      signIn,
      signOut,
      signUp,
    },
  };
}
