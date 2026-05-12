import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildAppSnapshot,
  fetchAppSnapshot,
  getSnapshotTimestamp,
  getSupabaseSession,
  signInWithEmail,
  signOutSupabase,
  signUpWithEmail,
  subscribeToSupabaseAuth,
  upsertAppSnapshot,
} from "../lib/cloudSync";
import { replaceDatabase, resetDatabase, saveDatabase, loadDatabase } from "../lib/db";
import { getSupabaseConfigError, isSupabaseConfigured } from "../lib/supabaseClient";
import type { TrainingDatabase } from "../types/domain";

type SyncPhase = "disabled" | "not-signed-in" | "syncing" | "synced" | "failed";

interface CloudSyncState {
  configured: boolean;
  session: Session | null;
  status: SyncPhase;
  message: string;
  lastSyncedAt?: string;
  lastError?: string;
}

const AUTO_SYNC_DELAY_MS = 3000;

function parseTimestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function useTrainingDb() {
  const [db, setDb] = useState<TrainingDatabase | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [cloud, setCloud] = useState<CloudSyncState>({
    configured: isSupabaseConfigured,
    session: null,
    status: isSupabaseConfigured ? "not-signed-in" : "disabled",
    message: isSupabaseConfigured ? "Not signed in." : getSupabaseConfigError() || "Cloud sync disabled.",
  });

  const dbRef = useRef<TrainingDatabase | undefined>(undefined);
  const lastUploadedUpdatedAtRef = useRef<string | undefined>(undefined);
  const hydratingFromCloudRef = useRef(false);
  const initSyncHandledRef = useRef(false);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  const persistDb = useCallback(async (next: TrainingDatabase, options?: { preserveUpdatedAt?: boolean }) => {
    const saved = await saveDatabase(next, options);
    setDb(saved);
    return saved;
  }, []);

  const importDb = useCallback(async (next: TrainingDatabase) => {
    const saved = await replaceDatabase(next, { preserveUpdatedAt: true });
    setDb(saved);
  }, []);

  const reseed = useCallback(async () => {
    const next = await resetDatabase();
    setDb(next);
  }, []);

  const syncSnapshotToCloud = useCallback(async (database?: TrainingDatabase) => {
    const session = cloud.session;
    const source = database || dbRef.current;
    if (!isSupabaseConfigured) {
      setCloud((current) => ({
        ...current,
        status: "disabled",
        message: getSupabaseConfigError() || "Cloud sync disabled.",
      }));
      return false;
    }
    if (!session || !source) {
      setCloud((current) => ({
        ...current,
        status: "not-signed-in",
        message: "Sign in to sync this device.",
      }));
      return false;
    }

    setCloud((current) => ({
      ...current,
      status: "syncing",
      message: "Syncing to Supabase...",
      lastError: undefined,
    }));

    try {
      const snapshot = buildAppSnapshot(source);
      const row = await upsertAppSnapshot(session.user.id, snapshot);
      lastUploadedUpdatedAtRef.current = snapshot.updatedAt;
      setCloud((current) => ({
        ...current,
        status: "synced",
        message: "Cloud snapshot is up to date.",
        lastSyncedAt: row.updated_at,
        lastError: undefined,
      }));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Cloud sync failed.";
      setCloud((current) => ({
        ...current,
        status: "failed",
        message: "Cloud sync failed.",
        lastError: message,
      }));
      return false;
    }
  }, [cloud.session]);

  const hydrateFromCloud = useCallback(async (session: Session | null, localDatabase?: TrainingDatabase) => {
    if (!isSupabaseConfigured) {
      setCloud({
        configured: false,
        session: null,
        status: "disabled",
        message: getSupabaseConfigError() || "Cloud sync disabled.",
      });
      return;
    }
    if (!session) {
      setCloud((current) => ({
        ...current,
        configured: true,
        session: null,
        status: "not-signed-in",
        message: "Sign in to sync this device.",
        lastError: undefined,
      }));
      return;
    }

    const local = localDatabase || dbRef.current;
    setCloud((current) => ({
      ...current,
      configured: true,
      session,
      status: "syncing",
      message: "Checking cloud snapshot...",
      lastError: undefined,
    }));

    try {
      const remote = await fetchAppSnapshot(session.user.id);
      if (!remote) {
        setCloud((current) => ({
          ...current,
          configured: true,
          session,
          status: "syncing",
          message: "Creating first cloud snapshot...",
          lastError: undefined,
        }));
        if (local) {
          await syncSnapshotToCloud(local);
        } else {
          setCloud((current) => ({
            ...current,
            configured: true,
            session,
            status: "synced",
            message: "Signed in. No local data to upload yet.",
          }));
        }
        return;
      }

      const remoteUpdatedAt = getSnapshotTimestamp(remote);
      const localUpdatedAt = local?.updatedAt;
      const remoteIsNewer = parseTimestamp(remoteUpdatedAt) > parseTimestamp(localUpdatedAt);

      if (remoteIsNewer && remote.data?.data) {
        hydratingFromCloudRef.current = true;
        const saved = await replaceDatabase(remote.data.data, { preserveUpdatedAt: true });
        setDb(saved);
        hydratingFromCloudRef.current = false;
        lastUploadedUpdatedAtRef.current = remote.data.updatedAt;
        setCloud((current) => ({
          ...current,
          configured: true,
          session,
          status: "synced",
          message: "Loaded the newer cloud snapshot.",
          lastSyncedAt: remote.updated_at,
          lastError: undefined,
        }));
        return;
      }

      lastUploadedUpdatedAtRef.current = remote.data.updatedAt;
      setCloud((current) => ({
        ...current,
        configured: true,
        session,
        status: "synced",
        message: "Using the newest local snapshot.",
        lastSyncedAt: remote.updated_at,
        lastError: undefined,
      }));

      if (local && parseTimestamp(local.updatedAt) > parseTimestamp(remoteUpdatedAt)) {
        await syncSnapshotToCloud(local);
      }
    } catch (err) {
      hydratingFromCloudRef.current = false;
      const message = err instanceof Error ? err.message : "Unable to reach Supabase.";
      setCloud((current) => ({
        ...current,
        configured: true,
        session,
        status: "failed",
        message: "Could not load the cloud snapshot.",
        lastError: message,
      }));
    }
  }, [syncSnapshotToCloud]);

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | undefined;

    async function init() {
      try {
        const local = await loadDatabase();
        if (cancelled) return;
        setDb(local);
        dbRef.current = local;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load local database.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }

      if (!isSupabaseConfigured || cancelled) return;

      try {
        const session = await getSupabaseSession();
        if (cancelled) return;
        setCloud((current) => ({ ...current, configured: true, session }));
        initSyncHandledRef.current = true;
        await hydrateFromCloud(session, dbRef.current);
      } catch (err) {
        if (!cancelled) {
          setCloud((current) => ({
            ...current,
            configured: true,
            session: null,
            status: "failed",
            message: "Could not initialize Supabase auth.",
            lastError: err instanceof Error ? err.message : "Unknown auth error.",
          }));
        }
      }

      subscription = subscribeToSupabaseAuth((_event, session) => {
        if (cancelled) return;
        setCloud((current) => ({ ...current, configured: true, session }));
        if (!initSyncHandledRef.current) {
          initSyncHandledRef.current = true;
          return;
        }
        void hydrateFromCloud(session, dbRef.current);
      });
    }

    void init();

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [hydrateFromCloud]);

  useEffect(() => {
    if (!db || !cloud.session || !isSupabaseConfigured) return;
    if (hydratingFromCloudRef.current) return;
    if (!db.updatedAt || db.updatedAt === lastUploadedUpdatedAtRef.current) return;

    const timeout = window.setTimeout(() => {
      void syncSnapshotToCloud(db);
    }, AUTO_SYNC_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [cloud.session, db, syncSnapshotToCloud]);

  const updateDb = useCallback(async (updater: (draft: TrainingDatabase) => TrainingDatabase) => {
    if (!dbRef.current) return;
    const next = updater(structuredClone(dbRef.current));
    await persistDb(next);
  }, [persistDb]);

  const currentUser = useMemo(() => db?.users.find((user) => user.id === db.currentUserId), [db]);

  const signUp = useCallback(async (email: string, password: string) => {
    const result = await signUpWithEmail(email, password);
    setCloud((current) => ({
      ...current,
      configured: true,
      session: result.session,
      status: result.session ? "syncing" : "not-signed-in",
      message: result.needsEmailConfirmation
        ? "Check your email to confirm your account before signing in."
        : "Account created. Syncing...",
      lastError: undefined,
    }));
    if (result.session) {
      await hydrateFromCloud(result.session, dbRef.current);
    }
    return result;
  }, [hydrateFromCloud]);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await signInWithEmail(email, password);
    await hydrateFromCloud(session, dbRef.current);
    return session;
  }, [hydrateFromCloud]);

  const signOut = useCallback(async () => {
    await signOutSupabase();
    lastUploadedUpdatedAtRef.current = undefined;
    setCloud((current) => ({
      ...current,
      session: null,
      status: "not-signed-in",
      message: "Signed out. Local mode is still active.",
      lastError: undefined,
    }));
  }, []);

  return {
    db,
    currentUser,
    loading,
    error,
    updateDb,
    importDb,
    reseed,
    setDb,
    cloud: {
      ...cloud,
      userEmail: cloud.session?.user.email,
      syncNow: () => syncSnapshotToCloud(dbRef.current),
      signIn,
      signOut,
      signUp,
    },
  };
}
