"use client";

import { useState } from "react";

export function Brand() {
  const [failed, setFailed] = useState(false);

  // Si existe /public/logo.png, se muestra el logo real. Si no, cae al emblema.
  if (!failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/logo.png"
        alt="AutoLujo S.A"
        onError={() => setFailed(true)}
        className="h-[4.5rem] w-auto max-w-[200px] object-contain brightness-110"
      />
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Emblem />
      <div className="leading-none">
        <div className="font-serif text-[17px] font-semibold tracking-tight text-side-ink">
          AutoLujo <span className="text-side-active">S.A</span>
        </div>
        <div className="mt-1 text-[9px] font-light uppercase tracking-[0.2em] text-side-muted">
          Siempre seguro
        </div>
      </div>
    </div>
  );
}

/** Emblema de respaldo: parrilla dorada, evoca el logo. */
function Emblem() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 34 34"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="0.5" y="0.5" width="33" height="33" rx="8" fill="#0f0f0f" stroke="#242423" />
      <g fill="var(--color-side-active)">
        <rect x="9" y="10.5" width="16" height="2.2" rx="1.1" />
        <rect x="8" y="14.2" width="18" height="2.2" rx="1.1" />
        <rect x="8.5" y="17.9" width="17" height="2.2" rx="1.1" />
        <rect x="9.5" y="21.6" width="15" height="2.2" rx="1.1" />
      </g>
    </svg>
  );
}
