// The logo rocket, upright and large, with a separately animatable flame.
export function Rocket({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 430" aria-hidden="true">
      <g className="rocket-flame">
        <path className="flame-outer" d="M100 284c30 14 37 58 0 142-37-84-30-128 0-142z" fill="#C6FF3D" />
        <path className="flame-inner" d="M100 284c15 10 18 40 0 88-18-48-15-78 0-88z" fill="#F5F5F2" />
      </g>
      <path d="M78 266h44l7 20H71z" fill="#26262f" />
      <path d="M58 188 22 247c-4 7-4 14 0 21l8 16c3 6 9 7 14 3l14-14z" fill="#E4E2F4" />
      <path d="M142 188l36 59c4 7 4 14 0 21l-8 16c-3 6-9 7-14 3l-14-14z" fill="#D2CFEA" />
      <path d="M100 18c29 30 42 83 42 146v90c0 8-6 14-14 14H72c-8 0-14-6-14-14v-90c0-63 13-116 42-146z" fill="#FFFFFF" />
      <path d="M100 18c29 30 42 83 42 146v90c0 8-6 14-14 14h-28z" fill="#0D0D12" opacity="0.07" />
      <path d="M58 226h84v10H58z" fill="#5B3DF5" />
      <circle cx="100" cy="128" r="22" fill="#E4E2F4" />
      <circle cx="100" cy="128" r="16" fill="#5B3DF5" />
      <circle cx="94" cy="122" r="4.5" fill="#FFFFFF" opacity="0.55" />
      <text x="100" y="196" textAnchor="middle" fontFamily="var(--font-geist-sans), sans-serif" fontSize="11" fontWeight="600" letterSpacing="1" fill="#9a9aa6">SIL-01</text>
    </svg>
  );
}
