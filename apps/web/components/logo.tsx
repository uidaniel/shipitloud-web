// Rocket icon (PRD section 20): white rocket tilted up-right, lime teardrop flame,
// violet window, on an electric violet rounded square (radius ~24%).
export function LogoIcon({ size = 28, square = true }: { size?: number; square?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx={square ? 15.4 : 32} fill="#5B3DF5" />
      <g transform="rotate(45 32 32) translate(32 33) scale(0.9) translate(-32 -32)">
        <path d="M32 52.5c-3.2-3.6-4.2-6.8-3.6-10.5h7.2c.6 3.7-.4 6.9-3.6 10.5z" fill="#C6FF3D" />
        <path
          d="M24.6 34.5 18.8 41a2 2 0 0 0-.5 1.3v1.6c0 1 1 1.6 1.9 1.2l5-2.5M39.4 34.5l5.8 6.5a2 2 0 0 1 .5 1.3v1.6c0 1-1 1.6-1.9 1.2l-5-2.5"
          fill="#fff"
        />
        <path d="M32 10.5c5.6 4.6 8.4 11.6 8.4 20.5v9.2a2.3 2.3 0 0 1-2.3 2.3H25.9a2.3 2.3 0 0 1-2.3-2.3V31c0-8.9 2.8-15.9 8.4-20.5z" fill="#fff" />
        <circle cx="32" cy="26.5" r="3.6" fill="#5B3DF5" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="brand">
      <LogoIcon />
      <span>
        ShipIt<span className="brand-loud">Loud</span>
      </span>
    </span>
  );
}
