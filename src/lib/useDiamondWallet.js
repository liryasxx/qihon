import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, useApp } from './state';

const empty = () => ({
  balance: 0,
  orders: [],
  unlocked: [],
  lastPassAt: 0,
});

const storageKey = (owner, kind) =>
  `qihon:wallet:${kind}:${owner}`;

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function walletValue(row) {
  return {
    balance: row.balance,
    orders: row.orders || [],
    unlocked: row.unlocked || [],
    lastPassAt: Number(row.last_pass_at || 0),
  };
}

export function useDiamondWallet() {
  const { user, authLoading, notify } = useApp();
  const owner = user?.id || '';
  const ownerRef = useRef(owner);
  ownerRef.current = owner;

  const pending = useRef(null);
  const busy = useRef(null);
  const refreshRef = useRef(null);

  const [state, setState] = useState({
    owner: '',
    value: empty(),
    revision: -1,
    loading: false,
    busy: false,
    error: '',
  });

  const current = state.owner === owner
    ? state
    : {
        value: empty(),
        loading: !!owner,
        busy: false,
        error: '',
        revision: -1,
      };

  const accept = useCallback((row, account) => {
    if (
      !row ||
      row.user_id !== account ||
      ownerRef.current !== account
    ) return;

    setState(previous => {
      if (
        previous.owner === account &&
        previous.revision > Number(row.revision)
      ) return previous;

      return {
        owner: account,
        value: walletValue(row),
        revision: Number(row.revision),
        loading: false,
        busy: previous.owner === account && previous.busy,
        error: '',
      };
    });
  }, []);

  const run = useCallback(async request => {
    if (ownerRef.current !== request.owner) {
      throw new Error('Your account changed. Reopen your wallet.');
    }

    const { data, error } = await supabase.rpc(
      'qihon_demo_wallet',
      {
        p_action: request.action,
        p_payload: {
          ...request.payload,
          owner: request.owner,
        },
        p_request_id: request.id,
      }
    );

    // Keep uncertain network requests for a retry with the same ID.
    if (!error || error.code) {
      if (
        pending.current?.id === request.id &&
        pending.current.owner === request.owner
      ) {
        pending.current = null;
      }

      try {
        const key = storageKey(request.owner, 'pending');

        if (readJSON(key)?.id === request.id) {
          localStorage.removeItem(key);
        }
      } catch {}
    }

    if (error) throw error;

    if (ownerRef.current !== request.owner) {
      throw new Error('Your account changed. Reopen your wallet.');
    }

    accept(data.wallet, request.owner);
    return data;
  }, [accept]);

  useEffect(() => {
    if (authLoading) return;

    if (!owner || !supabase) {
      pending.current = null;

      setState({
        owner,
        value: empty(),
        revision: -1,
        loading: false,
        busy: false,
        error: '',
      });

      return;
    }

    let active = true;
    let initialized = false;
    let refreshing = false;

    const cached = readJSON(storageKey(owner, 'cache'));
    const stored = readJSON(storageKey(owner, 'pending'));

    pending.current =
      stored?.owner === owner && stored.id ? stored : null;

    setState({
      owner,
      value: cached?.value || empty(),
      revision: -1,
      loading: true,
      busy: false,
      error: '',
    });

    async function refresh() {
      if (refreshing || busy.current?.owner === owner) return;
      refreshing = true;

      let recovery;

      try {
        if (!initialized) {
          const { data, error } = await supabase.rpc(
            'qihon_demo_wallet',
            {
              p_action: 'init',
              p_payload: {
                owner,
                initial: readJSON(`qihon:extras:${owner}`) || {},
              },
            }
          );

          if (error) throw error;
          if (!active) return;

          initialized = true;
          accept(data.wallet, owner);
        }

        recovery = pending.current?.owner === owner
          ? pending.current
          : null;

        if (recovery) {
          busy.current = recovery;

          setState(previous =>
            previous.owner === owner
              ? { ...previous, busy: true }
              : previous
          );

          await run(recovery);

          if (active) {
            notify('Your previous wallet update has synced.');
          }
        }

        const { data, error } = await supabase
          .from('qihon_demo_wallets')
          .select('*')
          .eq('user_id', owner)
          .single();

        if (error) throw error;
        if (active) accept(data, owner);
      } catch (error) {
        if (active) {
          setState(previous =>
            previous.owner === owner
              ? {
                  ...previous,
                  loading: false,
                  error:
                    error.message ||
                    'Could not sync diamonds. Check your connection.',
                }
              : previous
          );
        }
      } finally {
        if (recovery && busy.current === recovery) {
          busy.current = null;
        }

        if (active && recovery) {
          setState(previous =>
            previous.owner === owner
              ? { ...previous, busy: false }
              : previous
          );
        }

        refreshing = false;
      }
    }

    refreshRef.current = refresh;
    void refresh();

    const channel = supabase
      .channel(`qihon-wallet:${owner}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qihon_demo_wallets',
          filter: `user_id=eq.${owner}`,
        },
        event => {
          if (active && initialized) {
            accept(event.new, owner);
          }
        }
      )
      .subscribe(status => {
        if (active && status === 'SUBSCRIBED') {
          void refresh();
        }
      });

    const visibleRefresh = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };

    const timer = setInterval(visibleRefresh, 15000);

    window.addEventListener('focus', visibleRefresh);
    window.addEventListener('online', visibleRefresh);
    document.addEventListener('visibilitychange', visibleRefresh);

    return () => {
      active = false;
      clearInterval(timer);

      window.removeEventListener('focus', visibleRefresh);
      window.removeEventListener('online', visibleRefresh);
      document.removeEventListener(
        'visibilitychange',
        visibleRefresh
      );

      if (refreshRef.current === refresh) {
        refreshRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [owner, authLoading, accept, run, notify]);

  useEffect(() => {
    if (
      !owner ||
      state.owner !== owner ||
      state.revision < 0
    ) return;

    try {
      localStorage.setItem(
        storageKey(owner, 'cache'),
        JSON.stringify({
          value: state.value,
          revision: state.revision,
        })
      );
    } catch {}
  }, [owner, state.owner, state.value, state.revision]);

  async function change(action, payload) {
    if (!owner || !supabase) {
      throw new Error('Sign in to sync diamonds.');
    }

    if (ownerRef.current !== owner) {
      throw new Error('Your account changed. Reopen your wallet.');
    }

    if (authLoading || current.loading) {
      throw new Error('Your wallet is still loading. Please wait.');
    }

    if (busy.current?.owner === owner) {
      throw new Error('Your wallet is updating. Please wait.');
    }

    const previous = pending.current?.owner === owner
      ? pending.current
      : null;

    const same =
      previous?.action === action &&
      JSON.stringify(previous.payload) === JSON.stringify(payload);

    const request = same
      ? previous
      : {
          owner,
          id: crypto.randomUUID(),
          action,
          payload,
        };

    busy.current = request;

    setState(value =>
      value.owner === owner ? { ...value, busy: true } : value
    );

    try {
      if (previous && !same) await run(previous);

      pending.current = request;

      try {
        localStorage.setItem(
          storageKey(owner, 'pending'),
          JSON.stringify(request)
        );
      } catch {}

      return await run(request);
    } catch (error) {
      if (ownerRef.current === owner) {
        setState(value =>
          value.owner === owner
            ? {
                ...value,
                error: error.message || 'Could not sync diamonds.',
              }
            : value
        );
      }

      throw error;
    } finally {
      if (busy.current === request) busy.current = null;

      setState(value =>
        value.owner === owner ? { ...value, busy: false } : value
      );
    }
  }

  return {
    value: current.value,
    loading: authLoading || (!!owner && current.loading),
    busy: current.busy,
    error: current.error,
    refresh: () => refreshRef.current?.(),

    completeDemo: async (packId, methodId, chapter) => {
      const result = await change('topup', {
        packId,
        methodId,
        chapter: chapter || null,
      });

      return result.receiptId;
    },

    unlockDemo: async (target, freePass = false) => {
      try {
        await change(
          freePass ? 'pass' : 'unlock',
          { chapter: target }
        );

        return true;
      } catch (error) {
        notify(error.message || 'Could not unlock this chapter.');
        return false;
      }
    },
  };
}