/**
 * useContacts — خطافات بيانات الوحدة 1 (جهات الاتصال والحسابات).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  crmAccountService, crmContactService,
  type CrmAccount, type CrmContact,
} from '../../../services/sdk';

interface AsyncState<T> { data: T; loading: boolean; error: string | null; reload: () => void; }
export function useAsync<T>(loader: () => Promise<T>, initial: T, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const run = useCallback(loader, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true; setLoading(true); setError(null);
    run().then((d) => { if (alive) setData(d); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'حدث خطأ'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [run, tick]);
  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

export const useAccounts = () => useAsync<CrmAccount[]>(() => crmAccountService.listAccounts(), []);
export const useContactsList = () => useAsync<CrmContact[]>(() => crmContactService.listContacts(), []);
