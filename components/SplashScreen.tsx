'use client';

import { useEffect, useRef, useState } from 'react';

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const onDoneRef            = useRef(onDone);
  const [show,   setShow  ]  = useState(false);
  const [fading, setFading]  = useState(false);

  useEffect(() => { onDoneRef.current = onDone; });

  useEffect(() => {
    const t1 = setTimeout(() => setShow(true),         80);
    const t2 = setTimeout(() => setFading(true),     2800);
    const t3 = setTimeout(() => onDoneRef.current(), 3700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         9999,
        background:     '#000',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        opacity:        show && !fading ? 1 : 0,
        transition:     'opacity 0.9s ease',
        pointerEvents:  'none',
        userSelect:     'none',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/propertyscape_banner_final.png"
        alt="PropertyScape"
        style={{
          width:          'min(92vw, 1100px)',
          height:         'auto',
          objectFit:      'contain',
          display:        'block',
          imageRendering: 'auto',
        }}
      />
    </div>
  );
}
