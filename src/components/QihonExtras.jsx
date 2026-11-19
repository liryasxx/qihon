import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/state';
import { content } from '../lib/api';
import Icon from './Icon';
import { Cover, Loading } from './UI';
import './QihonExtras.css';

const Extras = createContext(null);

const packs = [
  {
    id: 'starter',
    name: 'Starter Pack',
    diamonds: 50,
    bonus: 0,
    price: 99,
  },
  {
    id: 'reader',
    name: 'Reader Pack',
    diamonds: 120,
    bonus: 20,
    price: 179,
  },
  {
    id: 'binge',
    name: 'Binge Pack',
    diamonds: 300,
    bonus: 70,
    price: 249,
  },
];

const methods = [
  {
    id: 'gcash',
    name: 'GCash E-Wallet',
    image: '/payments/gcash.png',
  },
  {
    id: 'maya',
    name: 'Maya',
    image: '/payments/maya.png',
  },
  {
    id: 'card',
    name: 'Credit / Debit Card',
    image: '/payments/card.png',
  },
];

const money = value =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(value);

const blank = () => ({
  read: [],
  balance: 0,
  orders: [],
  unlocked: [],
});

function loadSaved(owner) {
  try {
    const value = JSON.parse(
      localStorage.getItem(`qihon:extras:${owner}`) || 'null'
    );

    if (
      !value ||
      !Array.isArray(value.read) ||
      !Array.isArray(value.orders) ||
      !Array.isArray(value.unlocked) ||
      !Number.isSafeInteger(value.balance) ||
      value.balance < 0
    ) {
      return blank();
    }

    return value;
  } catch {
    return blank();
  }
}

function MiniIcon({ name, size = 22 }) {
  const paths = {
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    diamond: (
      <>
        <path d="m3 8 4-5h10l4 5-9 13Z" />
        <path d="M3 8h18M7 3l5 18 5-18" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    receipt: (
      <>
        <path d="M5 3h14v18l-3-2-4 2-4-2-3 2ZM8 7h8M8 11h8M8 15h5" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.bell}
    </svg>
  );
}

function relativeDate(date) {
  if (!date || Number.isNaN(Date.parse(date))) return 'Recently';

  const seconds = Math.max(
    0,
    (Date.now() - Date.parse(date)) / 1000
  );

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;

  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function QihonExtrasProvider({ children }) {
  const { user, authLoading, data, dataLoading } = useApp();
  const owner = authLoading ? 'loading' : user?.id || 'guest';

  const [saved, setSaved] = useState(() => ({
    owner,
    value: loadSaved(owner),
  }));

  const value = saved.owner === owner ? saved.value : blank();

  const [feed, setFeed] = useState({
    owner: '',
    key: '',
    items: [],
    loading: false,
    error: '',
  });

  const [refreshKey, setRefreshKey] = useState(0);
  const favorites = data.bookmarks.slice(0, 10);
  const favoritesKey = favorites.map(manga => manga.id).join(',');

  useEffect(() => {
    setSaved({ owner, value: loadSaved(owner) });
  }, [owner]);

  useEffect(() => {
    if (authLoading || saved.owner !== owner) return;

    try {
      localStorage.setItem(
        `qihon:extras:${owner}`,
        JSON.stringify(saved.value)
      );
    } catch {
      // The current session remains usable if device storage is unavailable.
    }
  }, [saved, owner, authLoading]);

  function update(change) {
    setSaved(previous => ({
      owner,
      value: change(
        previous.owner === owner
          ? previous.value
          : loadSaved(owner)
      ),
    }));
  }

  useEffect(() => {
    if (authLoading || dataLoading) return;

    let active = true;
    const controller = new AbortController();

    setFeed({
      owner,
      key: favoritesKey,
      items: [],
      loading: favorites.length > 0,
      error: '',
    });

    async function checkUpdates() {
      const results = await Promise.allSettled(
        favorites.map(async manga => {
          const result = await content(
            'chapters',
            { id: manga.id, sort: 'latest' },
            controller.signal
          );

          const chapter = result.items[0];
          if (!chapter) return null;

          return {
            id: `chapter:${chapter.id}`,
            category: 'updates',
            label: 'New Chapter',
            title: manga.title,
            text: `Chapter ${chapter.number}${
              chapter.title ? ` — ${chapter.title}` : ''
            } is available.`,
            date: chapter.date,
            manga,
            to: `/read/${chapter.id}`,
            action: 'Read Now',
          };
        })
      );

      if (!active) return;

      const items = results
        .filter(result =>
          result.status === 'fulfilled' && result.value
        )
        .map(result => result.value);

      items.sort(
        (a, b) =>
          (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)
      );

      const failed = results.some(
        result => result.status === 'rejected'
      );

      setFeed({
        owner,
        key: favoritesKey,
        items,
        loading: false,
        error: failed
          ? 'Some chapter updates could not load. Please refresh to try again.'
          : '',
      });
    }

    checkUpdates();

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    owner,
    favoritesKey,
    refreshKey,
    authLoading,
    dataLoading,
  ]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        setRefreshKey(key => key + 1);
      }
    };

    const timer = setInterval(refresh, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const chapterItems =
    feed.owner === owner && feed.key === favoritesKey
      ? feed.items
      : [];

  const systemItems = [
    {
      id: 'welcome:v1',
      category: 'system',
      label: 'Qihon',
      title: 'Welcome to Qihon',
      text: 'Bookmark a story to see its latest available English chapter here.',
      to: '/browse',
      action: 'Explore manhwa',
    },
    ...value.orders.map(order => ({
      id: `receipt:${order.id}`,
      category: 'system',
      label: 'Demo Receipt',
      title: order.packName,
      text: `${money(order.price)} simulated payment · ${
        order.diamonds
      } demo diamonds.`,
      date: order.date,
      to: `/checkout?receipt=${encodeURIComponent(order.id)}`,
      action: 'View receipt',
    })),
  ];

  const notifications = [
    ...chapterItems,
    ...systemItems,
  ].map(item => ({
    ...item,
    unread: !value.read.includes(item.id),
  }));

  function completeDemo(packId, methodId, chapter) {
    const pack = packs.find(item => item.id === packId);
    const method = methods.find(item => item.id === methodId);

    if (!pack || !method) {
      throw new Error('Choose a diamond pack and payment method.');
    }

    const id = `DEMO-${Date.now()
      .toString(36)
      .toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;

    const date = new Date().toISOString();

    update(previous => {
      const cost =
        chapter && !previous.unlocked.includes(chapter) ? 30 : 0;

      const balance =
        previous.balance + pack.diamonds + pack.bonus - cost;

      const order = {
        id,
        date,
        packName: pack.name,
        methodName: method.name,
        price: pack.price,
        diamonds: pack.diamonds + pack.bonus,
        cost,
        balance,
        chapter,
      };

      return {
        ...previous,
        balance,
        orders: [order, ...previous.orders].slice(0, 20),
        unlocked: chapter
          ? [...new Set([...previous.unlocked, chapter])]
          : previous.unlocked,
      };
    });

    return id;
  }

  return (
    <Extras.Provider
      value={{
        ...value,
        notifications,
        loading:
          authLoading ||
          dataLoading ||
          (feed.owner === owner && feed.loading),
        error: feed.owner === owner ? feed.error : '',
        limited: data.bookmarks.length > 10,
        refresh: () => setRefreshKey(key => key + 1),
        markRead: id =>
          update(previous => ({
            ...previous,
            read: [...new Set([...previous.read, id])].slice(-300),
          })),
        markAllRead: () =>
          update(previous => ({
            ...previous,
            read: [
              ...new Set([
                ...previous.read,
                ...notifications.map(item => item.id),
              ]),
            ].slice(-300),
          })),
        completeDemo,
      }}
    >
      {children}
    </Extras.Provider>
  );
}

export function NotificationBell() {
  const { notifications } = useContext(Extras);
  const count = notifications.filter(item => item.unread).length;

  return (
    <Link
      to="/notifications"
      className="icon-button q-notification-bell"
      aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
    >
      <MiniIcon name="bell" />
      {count > 0 && (
        <span className="q-unread-dot" aria-hidden="true" />
      )}
    </Link>
  );
}

export function DiamondWalletCard() {
  const { balance } = useContext(Extras);

  return (
    <section className="q-wallet-card">
      <span className="q-wallet-icon">
        <MiniIcon name="diamond" size={28} />
      </span>

      <div>
        <span>DIAMOND BALANCE</span>
        <strong>{balance.toLocaleString()}</strong>
        <small>Demo balance · This device</small>
      </div>

      <Link className="button primary" to="/checkout">
        Top Up
      </Link>
    </section>
  );
}

export function NotificationsPage() {
  const {
    notifications,
    loading,
    error,
    limited,
    refresh,
    markRead,
    markAllRead,
  } = useContext(Extras);

  const [filter, setFilter] = useState('all');

  const visible = notifications.filter(item =>
    filter === 'all' ||
    (filter === 'unread'
      ? item.unread
      : item.category === filter)
  );

  const unread = notifications.some(item => item.unread);

  return (
    <main className="page q-notifications-page">
      <div className="q-screen-heading">
        <Link
          to="/profile"
          className="icon-button"
          aria-label="Back to profile"
        >
          <Icon name="back" />
        </Link>

        <h1>Notifications</h1>

        <button
          className="text-button"
          onClick={markAllRead}
          disabled={!unread}
        >
          Mark all read
        </button>
      </div>

      <div
        className="q-notification-filters"
        role="group"
        aria-label="Filter notifications"
      >
        {[
          ['all', 'All'],
          ['unread', 'Unread'],
          ['updates', 'Updates'],
          ['system', 'System'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="q-inbox-tools">
        <span>Latest chapters from your bookmarks</span>
        <button
          type="button"
          className="text-button"
          onClick={refresh}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {limited && (
        <p className="q-secondary-note">
          Checking your 10 most recently saved stories.
        </p>
      )}

      {loading && <Loading text="Checking chapter updates…" />}
      {error && <p className="notice" role="alert">{error}</p>}

      <div className="q-notification-list">
        {visible.map(item => (
          <article className="q-notification-card" key={item.id}>
            {item.manga ? (
              <Cover manga={item.manga} />
            ) : (
              <span className="q-notification-art">
                <MiniIcon
                  name={
                    item.label === 'Demo Receipt'
                      ? 'receipt'
                      : 'bell'
                  }
                />
              </span>
            )}

            <div>
              <div className="q-notification-meta">
                <span>{item.label}</span>

                {item.date && (
                  <time dateTime={item.date}>
                    {relativeDate(item.date)}
                  </time>
                )}

                {item.unread && (
                  <span
                    className="q-card-unread"
                    aria-label="Unread"
                  />
                )}
              </div>

              <p>
                <strong>{item.title}</strong> — {item.text}
              </p>

              <div className="q-notification-actions">
                <Link
                  to={item.to}
                  onClick={() => markRead(item.id)}
                >
                  {item.action}
                  <Icon name="chevron" size={14} />
                </Link>

                {item.unread && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => markRead(item.id)}
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {!loading && !visible.length && (
        <div className="q-caught-up">
          <Icon name="check" size={28} />
          <h2>You're completely caught up!</h2>
          <p>
            New chapter notices appear here when Qihon checks
            your bookmarked stories.
          </p>
          <Link className="text-button" to="/browse">
            Browse manhwa
          </Link>
        </div>
      )}

      <p className="q-secondary-note">
        In-app updates refresh every five minutes while Qihon is
        open. Read status is saved on this device.
      </p>
    </main>
  );
}

export function CheckoutPage() {
  const {
    balance,
    orders,
    unlocked,
    completeDemo,
  } = useContext(Extras);

  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [packId, setPackId] = useState('reader');
  const [methodId, setMethodId] = useState('gcash');
  const [error, setError] = useState('');
  const submitting = useRef(false);

  const pack = packs.find(item => item.id === packId);
  const chapter = params.get('chapter') === '43' ? '43' : null;
  const cost =
    chapter && !unlocked.includes(chapter) ? 30 : 0;

  const remaining =
    balance + pack.diamonds + pack.bonus - cost;

  const receiptId = params.get('receipt');
  const receipt = orders.find(order => order.id === receiptId);
  const query = params.toString();

  useEffect(() => {
    submitting.current = false;
    setError('');
  }, [query]);

  function pay(event) {
    event.preventDefault();
    if (submitting.current) return;

    submitting.current = true;

    try {
      setParams({
        receipt: completeDemo(packId, methodId, chapter),
      });
    } catch (err) {
      setError(err.message || 'Could not complete the demo.');
      submitting.current = false;
    }
  }

  if (receiptId) {
    return (
      <main className="page q-checkout-page">
        <div className="q-demo-receipt">
          <Icon name="check" size={36} />
          <span className="q-demo-label">DEMO RECEIPT</span>

          <h1>
            {receipt
              ? 'Demo checkout complete'
              : 'Receipt unavailable'}
          </h1>

          {receipt ? (
            <>
              <p>No money was charged.</p>

              <dl>
                <div>
                  <dt>Reference</dt>
                  <dd>{receipt.id}</dd>
                </div>
                <div>
                  <dt>Pack</dt>
                  <dd>{receipt.packName}</dd>
                </div>
                <div>
                  <dt>Method</dt>
                  <dd>{receipt.methodName}</dd>
                </div>
                <div>
                  <dt>Simulated total</dt>
                  <dd>{money(receipt.price)}</dd>
                </div>
                <div>
                  <dt>Demo diamonds added</dt>
                  <dd>+{receipt.diamonds}</dd>
                </div>

                {receipt.cost > 0 && (
                  <div>
                    <dt>Sample chapter unlock</dt>
                    <dd>-{receipt.cost}</dd>
                  </div>
                )}

                <div>
                  <dt>Balance after this order</dt>
                  <dd>{receipt.balance} diamonds</dd>
                </div>
              </dl>
            </>
          ) : (
            <p>
              Demo receipts are available only on the device and
              account that created them.
            </p>
          )}

          <Link className="button primary" to="/profile">
            Back to Profile
          </Link>

          <button
            type="button"
            className="button secondary"
            onClick={() => navigate('/checkout')}
          >
            Top Up Again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page q-checkout-page">
      <div className="q-screen-heading">
        <Link
          to="/profile"
          className="icon-button"
          aria-label="Back to profile"
        >
          <Icon name="back" />
        </Link>

        <h1>
          {chapter
            ? 'Unlock Chapter 43'
            : 'Checkout & Diamond Pay'}
        </h1>

        <a
          className="icon-button"
          href="#checkout-help"
          aria-label="Checkout help"
        >
          <Icon name="info" />
        </a>
      </div>

      <p className="q-demo-notice">
        <strong>Demo checkout</strong> — no real payment is
        collected. Diamond balances and sample unlocks are stored
        on this device.
      </p>

      {!chapter && (
        <Link
          className="text-button q-demo-unlock-link"
          to="/checkout?chapter=43"
        >
          Preview Chapter 43 unlock
        </Link>
      )}

      <div className="q-lock-panel">
        <div>
          <span className="q-wallet-icon">
            <MiniIcon name={chapter ? 'lock' : 'diamond'} />
          </span>

          <h2>
            {chapter
              ? `Chapter 43 is ${cost ? 'Locked' : 'Unlocked'}`
              : 'Top Up Your Diamonds'}
          </h2>

          {chapter && (
            <span className="q-lock-label">
              {cost ? 'LOCKED' : 'UNLOCKED'}
            </span>
          )}
        </div>

        <div className="q-balance-strip">
          <span>
            Balance: <strong>{balance}</strong>
            <MiniIcon name="diamond" size={13} />
          </span>
          <span>
            Required: <strong>{cost}</strong>
            <MiniIcon name="diamond" size={13} />
          </span>
        </div>
      </div>

      <form onSubmit={pay}>
        <fieldset className="q-choice-group">
          <legend>1. CHOOSE DIAMOND PACK</legend>

          {packs.map(option => (
            <label
              key={option.id}
              className={`q-pack-option ${
                packId === option.id ? 'is-selected' : ''
              }`}
            >
              <input
                type="radio"
                name="diamond-pack"
                value={option.id}
                checked={packId === option.id}
                onChange={() => setPackId(option.id)}
              />

              <span className="q-pack-name">{option.name}</span>

              <span className="q-diamond-count">
                {option.diamonds}
                <MiniIcon name="diamond" size={13} />
              </span>

              {option.bonus > 0 && (
                <span className="q-pack-bonus">
                  +{option.bonus}
                  <br />
                  Bonus
                </span>
              )}

              <span className="q-pack-price">₱{option.price}</span>

              {option.id === 'reader' && (
                <span className="q-popular">MOST POPULAR</span>
              )}
            </label>
          ))}
        </fieldset>

        <fieldset className="q-choice-group">
          <legend>2. PAYMENT METHOD</legend>

          {methods.map(method => (
            <label
              key={method.id}
              className={`q-payment-option ${
                methodId === method.id ? 'is-selected' : ''
              }`}
            >
              <img
                src={method.image}
                width="40"
                height="40"
                alt=""
              />

              <span>{method.name}</span>

              <input
                type="radio"
                name="payment-method"
                value={method.id}
                checked={methodId === method.id}
                onChange={() => setMethodId(method.id)}
              />
            </label>
          ))}
        </fieldset>

        <section className="q-order-section">
          <h2>3. ORDER SUMMARY</h2>

          <div className="q-order-summary">
            <div className="q-summary-pack">
              <span>{pack.name}</span>
              <strong>{money(pack.price)}</strong>
            </div>

            <dl>
              <div>
                <dt>{pack.name}</dt>
                <dd>+{pack.diamonds + pack.bonus} Diamonds</dd>
              </div>

              {chapter && (
                <div>
                  <dt>Chapter 43 Unlock Cost</dt>
                  <dd>-{cost} Diamonds</dd>
                </div>
              )}

              <div>
                <dt>Remaining Diamond Balance</dt>
                <dd>{remaining} Diamonds</dd>
              </div>

              <div className="q-summary-total">
                <dt>Total Due Today</dt>
                <dd>{money(pack.price)}</dd>
              </div>
            </dl>

            <p className="q-payment-note">
              <MiniIcon name="lock" size={14} />
              Simulation only · No payment details needed
            </p>
          </div>
        </section>

        {error && (
          <p className="form-error" role="alert">{error}</p>
        )}

        <button
          className="button primary full-width q-pay-button"
          type="submit"
        >
          Demo: Pay {money(pack.price)}
          {chapter && cost ? ' & Unlock Chapter 43' : ''}
        </button>
      </form>

      <section className="q-checkout-help" id="checkout-help">
        <h2>Need Help with Your Order?</h2>
        <p>
          This checkout demonstrates your Figma payment flow.
          Real GCash, Maya, and card payments require a connected
          payment provider.
        </p>

        <div>
          <Link className="button secondary" to="/about">
            Help & Support
          </Link>
          <a className="button secondary" href="#checkout-faq">
            View FAQ
          </a>
        </div>
      </section>

      <section id="checkout-faq" className="q-checkout-faq">
        <details>
          <summary>Will I be charged?</summary>
          <p>
            No. The button creates a demo receipt and adds demo
            diamonds on this device.
          </p>
        </details>

        <details>
          <summary>Does this lock live manhwa chapters?</summary>
          <p>
            No. Chapter 43 is a sample checkout scenario. The
            existing MangaDex reader stays freely accessible.
          </p>
        </details>

        <details>
          <summary>
            Can I preview the chapter-unlock screen?
          </summary>
          <p>
            <Link to="/checkout?chapter=43">
              Open the Chapter 43 checkout example
            </Link>
          </p>
        </details>
      </section>
    </main>
  );
}