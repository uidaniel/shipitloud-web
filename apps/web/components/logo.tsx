// ShipItLoud mark: a play button that's loud. White rounded triangle, two lime sound waves,
// on an electric violet rounded square (radius ~24%).
export function LogoIcon({ size = 28, square = true }: { size?: number; square?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx={square ? 15.4 : 32} fill="#5B3DF5" />
      <polygon points="19.04,21.76 19.04,42.24 33.6,32" fill="#fff" stroke="#fff" strokeWidth="5.6" strokeLinejoin="round" />
      <path d="M40.62 25.78A8.8 8.8 0 0 1 40.62 38.22" fill="none" stroke="#C6FF3D" strokeWidth="3.7" strokeLinecap="round" />
      <path d="M45.43 20.97A15.6 15.6 0 0 1 45.43 43.03" fill="none" stroke="#C6FF3D" strokeWidth="3.7" strokeLinecap="round" />
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
