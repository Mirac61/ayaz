export function AyazLogo({
  size = 56,
  variant = "frost",
  className,
}: {
  size?: number;
  variant?: "frost" | "ruhe";
  className?: string;
}) {
  if (variant === "ruhe") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="ayaz-ruhe-glow" cx="50%" cy="50%" r="50%">
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.5" />
            <stop offset="85%" stopColor="#70d6ff" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#70d6ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ayaz-ruhe-rim" x1="120" y1="120" x2="392" y2="392" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="35%" stopColor="#70d6ff" />
            <stop offset="70%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </linearGradient>
        </defs>
        <circle cx="256" cy="256" r="210" fill="url(#ayaz-ruhe-glow)" />
        <circle cx="256" cy="256" r="168" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
        <line x1="256" y1="76" x2="256" y2="92" stroke="rgba(112, 214, 255, 0.7)" strokeWidth="2" />
        <line x1="256" y1="420" x2="256" y2="436" stroke="rgba(112, 214, 255, 0.4)" strokeWidth="2" />
        <line x1="76" y1="256" x2="92" y2="256" stroke="rgba(112, 214, 255, 0.4)" strokeWidth="2" />
        <line x1="420" y1="256" x2="436" y2="256" stroke="rgba(112, 214, 255, 0.7)" strokeWidth="2" />
        <circle cx="256" cy="256" r="124" stroke="url(#ayaz-ruhe-rim)" strokeWidth="7" />
        <circle cx="256" cy="256" r="120" fill="var(--bg-0, #161617)" />
        <circle cx="256" cy="132" r="5" fill="#ffffff" />
        <line x1="256" y1="118" x2="256" y2="146" stroke="#ffffff" strokeWidth="2" />
        <line x1="242" y1="132" x2="270" y2="132" stroke="#ffffff" strokeWidth="2" />
      </svg>
    );
  }

  // Standard: Kälte & Frost (16-Faceted Master Ice Crystal)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="ayaz-frost-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#70d6ff" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="256" cy="256" r="200" fill="url(#ayaz-frost-glow)" />

      {/* Vertical Spire */}
      <polygon points="256,50 278,236 256,256 256,50" fill="#ffffff" />
      <polygon points="256,50 256,256 234,236 256,50" fill="#cbe6ff" />
      <polygon points="256,462 278,276 256,256 256,462" fill="#38bdf8" />
      <polygon points="256,462 256,256 234,276 256,462" fill="#0284c7" />

      {/* Horizontal Spire */}
      <polygon points="50,256 236,234 256,256 50,256" fill="#70d6ff" />
      <polygon points="50,256 256,256 236,278 50,256" fill="#0284c7" />
      <polygon points="462,256 276,234 256,256 462,256" fill="#ffffff" />
      <polygon points="462,256 256,256 276,278 462,256" fill="#bae6fd" />

      {/* 4 Diagonal Needles */}
      <polygon points="402,110 280,232 256,256 402,110" fill="#e0f2fe" />
      <polygon points="402,110 256,256 272,240 402,110" fill="#7dd3fc" />
      <polygon points="402,402 280,280 256,256 402,402" fill="#38bdf8" />
      <polygon points="402,402 256,256 272,272 402,402" fill="#0369a1" />
      <polygon points="110,110 232,232 256,256 110,110" fill="#bae6fd" />
      <polygon points="110,110 256,256 240,240 110,110" fill="#38bdf8" />
      <polygon points="110,402 232,280 256,256 110,402" fill="#0284c7" />
      <polygon points="110,402 256,256 240,272 110,402" fill="#082f49" />

      {/* Central Diamond Heart */}
      <polygon points="256,216 296,256 256,296 216,256" fill="#ffffff" />
      <polygon points="256,216 256,296 216,256" fill="#e0f2fe" />
    </svg>
  );
}
