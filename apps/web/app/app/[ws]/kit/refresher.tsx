'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Refreshes the page while background work is running. */
export function KitRefresher({ every = 3000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
