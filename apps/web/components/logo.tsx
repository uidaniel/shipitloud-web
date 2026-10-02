// ShipItLoud mark, "Play loud" (PRD section 20): a white rounded play button with two lime sound waves,
// on an electric violet rounded square (radius 24%). Geometry is the PRD's exact spec.
export function LogoIcon({ size = 28, square = true }: { size?: number; square?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" rx={square ? 24 : 50} fill="#5B3DF5" />
      <path d="M24 34 C24 29 29 26 33 29 L54 44 C58 47 58 53 54 56 L33 71 C29 74 24 71 24 66 Z" fill="#fff" />
      <path d="M64 40 A14 14 0 0 1 64 60" fill="none" stroke="#C6FF3D" strokeWidth="6" strokeLinecap="round" />
      <path d="M72 32 A25 25 0 0 1 72 68" fill="none" stroke="#C6FF3D" strokeWidth="6" strokeLinecap="round" />
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
