import { useEffect, useState } from 'react';
import { useApp } from '../lib/state';
import { useQihonExtras } from './QihonExtras';
import Icon from './Icon';
import './SplashScreen.css';

export default function SplashScreen({ children }) {
  const { authLoading, dataLoading } = useApp();
  const { walletLoading } = useQihonExtras();

  const [fontsReady, setFontsReady] = useState(false);
  const [minimumReady, setMinimumReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [phase, setPhase] = useState('loading');

  const visible = phase !== 'done';

  const accountReady =
    !authLoading && !dataLoading && !walletLoading;

  const ready =
    minimumReady &&
    ((fontsReady && accountReady) || expired);

  const progress =
    phase !== 'loading' || expired
      ? 100
      : Math.round(
          ((1 + Number(fontsReady) + Number(accountReady)) / 3) * 100
        );

  useEffect(() => {
    let active = true;

    const minimumTimer = setTimeout(
      () => setMinimumReady(true),
      1300
    );

    const maximumTimer = setTimeout(
      () => setExpired(true),
      4500
    );

    Promise.resolve(document.fonts?.ready)
      .catch(() => {})
      .then(() => {
        if (active) setFontsReady(true);
      });

    return () => {
      active = false;
      clearTimeout(minimumTimer);
      clearTimeout(maximumTimer);
    };
  }, []);

  useEffect(() => {
    if (ready) {
      setPhase(previous =>
        previous === 'loading' ? 'leaving' : previous
      );
    }
  }, [ready]);

  useEffect(() => {
    if (phase !== 'leaving') return;

    const timer = setTimeout(
      () => setPhase('done'),
      280
    );

    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!visible) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible]);

  return (
    <>
      <div
        inert={visible}
        aria-hidden={visible || undefined}
      >
        {children}
      </div>

      {visible && (
        <SplashVisual
          progress={progress}
          leaving={phase === 'leaving'}
        />
      )}
    </>
  );
}

export function SplashVisual({ progress, leaving = false }) {
  return (
    <div
      className={`qihon-splash${leaving ? ' is-leaving' : ''}`}
      role="status"
      aria-label="Opening Qihon"
    >
      <div className="qihon-splash-top" aria-hidden="true">
        <span>IMMERSION V2.4</span>

        <span className="qihon-splash-ready">
          <i />
          {progress === 100 ? 'Ready' : 'Loading'}
        </span>
      </div>

      <div className="qihon-splash-brand">
        <span className="qihon-splash-mark" aria-hidden="true">
          <Icon name="logo" size={52} />
          <span className="qihon-splash-sparkle">✦</span>
        </span>

        <h1>QIHON</h1>
        <p>Uninterrupted Manhwa Immersion</p>
      </div>

      <div className="qihon-splash-bottom">
        <div className="qihon-splash-label" aria-hidden="true">
          <span>Loading Assets</span>
          <span>{progress}%</span>
        </div>

        <div
          className="qihon-splash-track"
          role="progressbar"
          aria-label="App startup"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span style={{ width: `${progress}%` }} />
        </div>

        <p>Zero clutter. Pure artwork.</p>
      </div>
    </div>
  );
}