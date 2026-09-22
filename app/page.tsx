'use client';

import { useState, useEffect, useCallback } from 'react';
import IngestPipeline from '@/components/IngestPipeline';
import SplashScreen from '@/components/SplashScreen';

const SPLASH_KEY = 'axiom_splash_done';

export default function Home() {
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem(SPLASH_KEY)) {
      setShowSplash(true);
    }
  }, []);

  const handleSplashDone = useCallback(() => {
    sessionStorage.setItem(SPLASH_KEY, '1');
    setShowSplash(false);
  }, []);

  return (
    <>
      {showSplash && <SplashScreen onDone={handleSplashDone} />}
      <IngestPipeline />
    </>
  );
}
