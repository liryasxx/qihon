import { QihonExtrasProvider } from './components/QihonExtras';
import React from 'react';
import { ReadingProvider } from './components/ReadingFeatures';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';

import './styles.css';

import App from './App.jsx';
import SplashScreen from './components/SplashScreen';
import { AppProvider } from './lib/state.jsx';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AppProvider>
      <QihonExtrasProvider>
        <ReadingProvider>
          <SplashScreen>
            <App />
          </SplashScreen>
        </ReadingProvider>
      </QihonExtrasProvider>
    </AppProvider>
  </BrowserRouter>
);