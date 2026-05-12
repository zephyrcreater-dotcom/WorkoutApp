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
  data: AppSnapshotEnvelope;
  version: number;
  updated_at: string;
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
  const envelopeTs = row.data?.updatedAt ? Date.parse(row.data.updatedAt) : 0;
  const rowTs = row.updated_at ? Date.parse(row.updated_at) : 0;
  return envelopeTs >= rowTs ? (row.data?.updatedAt || row.updated_at) : row.updated_at;
}
