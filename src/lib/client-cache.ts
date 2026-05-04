"use client";

import { useCallback, useEffect, useState } from "react";

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
  updatedAt: number;
};

const resourceCache = new Map<string, CacheEntry<unknown>>();

export function getCachedResource<T>(key: string): CacheEntry<T> | null {
  const hit = resourceCache.get(key) as CacheEntry<T> | undefined;
  return hit ?? null;
}

export function setCachedResource<T>(key: string, data: T, ttlMs: number) {
  resourceCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
    updatedAt: Date.now(),
  });
}

export function prefetchJson<T>(key: string, url: string, ttlMs = 30_000) {
  const hit = getCachedResource<T>(key);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.data);
  return fetch(url, { cache: "no-store" })
    .then((response) => response.json() as Promise<T>)
    .then((data) => {
      setCachedResource(key, data, ttlMs);
      return data;
    });
}

export function useCachedJson<T>(
  key: string,
  url: string,
  options: { ttlMs?: number; revalidateOnMount?: boolean } = {},
) {
  const ttlMs = options.ttlMs ?? 30_000;
  const initial = getCachedResource<T>(key);
  const [data, setData] = useState<T | null>(initial?.data ?? null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<Error | null>(null);
  const [updatedAt, setUpdatedAt] = useState(initial?.updatedAt ?? 0);

  const refresh = useCallback(async (force = false) => {
    const hit = getCachedResource<T>(key);
    if (!force && hit && hit.expiresAt > Date.now()) {
      setData(hit.data);
      setUpdatedAt(hit.updatedAt);
      setLoading(false);
      return hit.data;
    }

    setLoading((current) => current || !hit);
    setError(null);
    const requestUrl = force ? withRefreshParam(url) : url;
    try {
      const next = await fetch(requestUrl, { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        return response.json() as Promise<T>;
      });
      setCachedResource(key, next, ttlMs);
      const cached = getCachedResource<T>(key);
      setData(next);
      setUpdatedAt(cached?.updatedAt ?? Date.now());
      return next;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return null;
    } finally {
      setLoading(false);
    }
  }, [key, ttlMs, url]);

  useEffect(() => {
    const hit = getCachedResource<T>(key);
    const isFresh = hit && hit.expiresAt > Date.now();
    if (isFresh) {
      setData(hit.data);
      setUpdatedAt(hit.updatedAt);
      setLoading(false);
      if (options.revalidateOnMount) void refresh(true);
      return;
    }
    void refresh(false);
  }, [key, options.revalidateOnMount, refresh]);

  return {
    data,
    loading,
    error,
    updatedAt,
    refresh,
    isStale: updatedAt > 0 && Date.now() - updatedAt > ttlMs,
  };
}

function withRefreshParam(url: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}refresh=1`;
}
