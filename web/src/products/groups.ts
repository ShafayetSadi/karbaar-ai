import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../api/client';
import { call } from '../api/call';
import { unwrap } from '../api/query';
import type { components } from '../api/schema';

/** A category or a collection: the API returns both in the same shape. */
export type Group = components['schemas']['GroupRead'];
export type GroupKind = 'categories' | 'collections';

/** The shop's categories or collections, newest data after `reload()`; null while loading.
 * Cached per kind and status, so the product list, the editor and bulk actions share one request. */
export function useGroups(kind: GroupKind, status: 'active' | 'all' = 'active') {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['groups', kind, status],
    queryFn: async () =>
      unwrap(
        await call(() =>
          kind === 'categories'
            ? api.GET('/v1/categories', { params: { query: { status } } })
            : api.GET('/v1/collections', { params: { query: { status } } }),
        ),
      ).items,
  });

  // Every status of this kind: a change made on the "all" list shows in the "active" one too.
  const reload = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['groups', kind] }),
    [queryClient, kind],
  );
  const setItems = useCallback(
    (items: Group[]) => queryClient.setQueryData(['groups', kind, status], items),
    [queryClient, kind, status],
  );
  return { items: query.data ?? null, failed: query.isError, reload, setItems };
}

/** "three piece, থ্রি পিস" as the alias list the API takes. */
export function parseAliasList(input: string): string[] {
  return input
    .split(/[,،]/)
    .map((alias) => alias.trim())
    .filter(Boolean);
}

/** Move the item at `index` one place up (-1) or down (+1); the same array if it cannot move. */
export function moved<T>(items: T[], index: number, step: -1 | 1): T[] {
  const target = index + step;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, ...(item === undefined ? [] : [item]));
  return next;
}
