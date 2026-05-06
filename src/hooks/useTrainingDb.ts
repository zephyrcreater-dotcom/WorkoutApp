import { useCallback, useEffect, useMemo, useState } from "react";
import { loadDatabase, replaceDatabase, resetDatabase, saveDatabase } from "../lib/db";
import type { TrainingDatabase } from "../types/domain";

export function useTrainingDb() {
  const [db, setDb] = useState<TrainingDatabase | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    loadDatabase()
      .then(setDb)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Unable to load local database."))
      .finally(() => setLoading(false));
  }, []);

  const updateDb = useCallback(async (updater: (draft: TrainingDatabase) => TrainingDatabase) => {
    if (!db) return;
    const next = updater(structuredClone(db));
    await saveDatabase(next);
    setDb(next);
  }, [db]);

  const importDb = useCallback(async (next: TrainingDatabase) => {
    await replaceDatabase(next);
    setDb(next);
  }, []);

  const reseed = useCallback(async () => {
    const next = await resetDatabase();
    setDb(next);
  }, []);

  const currentUser = useMemo(() => db?.users.find((user) => user.id === db.currentUserId), [db]);

  return { db, currentUser, loading, error, updateDb, importDb, reseed, setDb };
}
