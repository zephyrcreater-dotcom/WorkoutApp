import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { TrainingDatabase } from "../types/domain";
import { getSupabaseConfigError, isSupabaseConfigured, supabase } from "./supabaseClient";

export interface AppSnapshotEnvelope {
  version: number;
  updatedAt: string;
  data: TrainingDatabase;
}

export interface AppSnapshotRow {
  id: string;
  user_id: string;
  data: unknown;
  version: number;
  updated_at: string;
}

export interface SnapshotSummary {
  updatedAt?: string;
  exerciseCount: number;
  splitCount: number;
  blockCount: number;
  workoutSessionCount: number;
  completedSessionCount: number;
}

function requireSupabase() {
  if (!supabase) {
    throw new Error(getSupabaseConfigError() || "Supabase is not configured.");
  }
  return supabase;
}

export function buildAppSnapshot(database: TrainingDatabase): AppSnapshotEnvelope {
  return {
    version: database.version,
    updatedAt: database.updatedAt || new Date().toISOString(),
    data: database,
  };
}

export function isValidAppSnapshotEnvelope(value: unknown): value is AppSnapshotEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const data = candidate.data as Record<string, unknown> | undefined;
  return typeof candidate.version === "number"
    && typeof candidate.updatedAt === "string"
    && !!data
    && typeof data === "object"
    && typeof data.version === "number"
    && Array.isArray(data.users)
    && Array.isArray(data.exercises)
    && Array.isArray(data.programs)
    && Array.isArray(data.sessions);
}

export async function getSupabaseSession(): Promise<Session | null> {
  if (!isSupabaseConfigured) return null;
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function subscribeToSupabaseAuth(
  callback: (event: AuthChangeEvent, session: Session | null) => void
) {
  if (!isSupabaseConfigured) {
    return { unsubscribe: () => undefined };
  }
  const client = requireSupabase();
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange(callback);
  return subscription;
}

export async function signUpWithEmail(email: string, password: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return {
    session: data.session,
    needsEmailConfirmation: !data.session,
    user: data.user,
  };
}

export async function signInWithEmail(email: string, password: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOutSupabase() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function fetchAppSnapshot(userId: string): Promise<AppSnapshotRow | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("app_snapshots")
    .select("id, user_id, data, version, updated_at")
    .eq("user_id", userId)
    .maybeSingle<AppSnapshotRow>();
  if (error) throw error;
  return data;
}

export async function upsertAppSnapshot(userId: string, snapshot: AppSnapshotEnvelope): Promise<AppSnapshotRow> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("app_snapshots")
    .upsert(
      {
        user_id: userId,
        data: snapshot,
        version: snapshot.version,
        updated_at: snapshot.updatedAt,
      },
      { onConflict: "user_id" }
    )
    .select("id, user_id, data, version, updated_at")
    .single<AppSnapshotRow>();
  if (error) throw error;
  return data;
}

export function getSnapshotTimestamp(row: AppSnapshotRow): string {
  const envelope = isValidAppSnapshotEnvelope(row.data) ? row.data : undefined;
  const envelopeTs = envelope?.updatedAt ? Date.parse(envelope.updatedAt) : 0;
  const rowTs = row.updated_at ? Date.parse(row.updated_at) : 0;
  return envelopeTs >= rowTs ? (envelope?.updatedAt || row.updated_at) : row.updated_at;
}

function parseTimestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getEntityTimestamp(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const candidate = value as Record<string, unknown>;
  const timestampKeys = ["updatedAt", "completedAt", "startedAt", "createdAt", "date"];
  for (const key of timestampKeys) {
    const raw = candidate[key];
    if (typeof raw === "string") {
      const parsed = parseTimestamp(raw);
      if (parsed) return parsed;
    }
  }
  return 0;
}

function mergeCollectionsById<T extends { id: string }>(localItems: T[] | undefined, cloudItems: T[] | undefined): T[] {
  const merged = new Map<string, T>();

  (cloudItems || []).forEach((item) => {
    merged.set(item.id, structuredClone(item));
  });

  (localItems || []).forEach((item) => {
    const existing = merged.get(item.id);
    if (!existing) {
      merged.set(item.id, structuredClone(item));
      return;
    }

    const localTimestamp = getEntityTimestamp(item);
    const cloudTimestamp = getEntityTimestamp(existing);
    if (localTimestamp > cloudTimestamp) {
      merged.set(item.id, structuredClone(item));
    }
  });

  return Array.from(merged.values());
}

export function summarizeSnapshot(snapshot: AppSnapshotEnvelope): SnapshotSummary {
  const data = snapshot.data;
  return {
    updatedAt: snapshot.updatedAt || data.updatedAt,
    exerciseCount: data.exercises.length,
    splitCount: data.splitTemplates.length,
    blockCount: data.programs.reduce((count, program) => count + program.blocks.length, 0),
    workoutSessionCount: data.sessions.length,
    completedSessionCount: data.sessions.filter((session) => session.status === "completed").length,
  };
}

export function mergeAppSnapshots(local: AppSnapshotEnvelope, cloud: AppSnapshotEnvelope): AppSnapshotEnvelope {
  const localData = local.data;
  const cloudData = cloud.data;
  const localUpdatedAt = parseTimestamp(local.updatedAt || localData.updatedAt);
  const cloudUpdatedAt = parseTimestamp(cloud.updatedAt || cloudData.updatedAt);
  const mergedUpdatedAt = localUpdatedAt > cloudUpdatedAt
    ? (local.updatedAt || localData.updatedAt || new Date(localUpdatedAt).toISOString())
    : (cloud.updatedAt || cloudData.updatedAt || new Date(cloudUpdatedAt).toISOString());

  const mergedData: TrainingDatabase = {
    ...structuredClone(cloudData),
    version: Math.max(local.version, cloud.version, localData.version, cloudData.version),
    updatedAt: mergedUpdatedAt,
    users: mergeCollectionsById(localData.users, cloudData.users),
    gyms: mergeCollectionsById(localData.gyms, cloudData.gyms),
    exercises: mergeCollectionsById(localData.exercises, cloudData.exercises),
    splitTemplates: mergeCollectionsById(localData.splitTemplates, cloudData.splitTemplates),
    workoutTemplates: mergeCollectionsById(localData.workoutTemplates, cloudData.workoutTemplates),
    programs: mergeCollectionsById(localData.programs, cloudData.programs),
    sessions: mergeCollectionsById(localData.sessions, cloudData.sessions),
    exercisePerformanceLogs: mergeCollectionsById(localData.exercisePerformanceLogs || [], cloudData.exercisePerformanceLogs || []),
    gymExerciseVariants: mergeCollectionsById(localData.gymExerciseVariants || [], cloudData.gymExerciseVariants || []),
    readiness: mergeCollectionsById(localData.readiness, cloudData.readiness),
    prs: mergeCollectionsById(localData.prs, cloudData.prs),
    weakPoints: mergeCollectionsById(localData.weakPoints, cloudData.weakPoints),
    programGaps: mergeCollectionsById(localData.programGaps || [], cloudData.programGaps || []),
    recommendations: mergeCollectionsById(localData.recommendations, cloudData.recommendations),
    currentUserId: cloudData.currentUserId || localData.currentUserId,
  };

  return {
    version: mergedData.version,
    updatedAt: mergedUpdatedAt,
    data: mergedData,
  };
}
