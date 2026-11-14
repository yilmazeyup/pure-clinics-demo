import { useCallback, useMemo } from 'react';

import { usePraktijk, useShared } from '../../context';
import { seedDuplicates, type DuplicatePair } from '../../data/clients';
import { practiceClients, type PracticeClient } from '../../data/core';

type Duplicates = { clients: PracticeClient[]; pairs: DuplicatePair[] };

/**
 * The client register as both Cliënten and Dossier see it: everyone in the agenda's window, the duplicates waiting to be
 * merged, and the clients added in this session ('clients'), with the edits and removals of this session applied.
 */
export function useClients() {
  const { today } = usePraktijk();
  const base = useMemo(() => practiceClients(today), [today]);
  const [added, setAdded] = useShared<PracticeClient[]>('clients', () => []);
  const [dups, setDups] = useShared<Duplicates>('clients:duplicates', () => seedDuplicates(base, today));
  const [edits, setEdits] = useShared<Record<string, Partial<PracticeClient>>>('clients:edits', () => ({}));
  const [removed, setRemoved] = useShared<string[]>('clients:removed', () => []);
  // The code of a foreign insurer is an optional extra next to the register's own fields.
  const [foreign, setForeignAll] = useShared<Record<string, string>>('clients:foreign', () => ({}));
  const setForeign = useCallback((id: string, code: string) => setForeignAll((all) => ({ ...all, [id]: code })), [setForeignAll]);

  const list = useMemo(() => {
    const gone = new Set(removed);
    const all = [...added, ...base, ...dups.clients].filter((c) => !gone.has(c.id));
    return all.map((c) => (edits[c.id] ? { ...c, ...edits[c.id] } : c));
  }, [added, base, dups, edits, removed]);

  const addedIds = useMemo(() => new Set(added.map((c) => c.id)), [added]);
  const pairs = useMemo(() => dups.pairs.filter((p) => !removed.includes(p.a) && !removed.includes(p.b)), [dups, removed]);

  const add = useCallback((client: PracticeClient) => setAdded((list) => [client, ...list]), [setAdded]);
  const update = useCallback(
    (id: string, patch: Partial<PracticeClient>) => setEdits((all) => ({ ...all, [id]: { ...all[id], ...patch } })),
    [setEdits],
  );
  const remove = useCallback((id: string) => setRemoved((ids) => [...ids, id]), [setRemoved]);
  /** Keeps `keep` with the chosen values and drops `drop`; the duplicate pair disappears with it. */
  const merge = useCallback(
    (keep: string, drop: string, patch: Partial<PracticeClient>) => {
      update(keep, patch);
      remove(drop);
      setDups((d) => ({ ...d, pairs: d.pairs.filter((p) => p.b !== drop && p.a !== drop) }));
    },
    [update, remove, setDups],
  );

  const byId = useCallback((id: string | null) => (id ? list.find((c) => c.id === id) : undefined), [list]);
  return { list, pairs, addedIds, add, update, remove, merge, byId, foreign, setForeign };
}
