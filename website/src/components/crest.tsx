export function Crest({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="38"
      height="38"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1.1">
        <circle cx="32" cy="32" r="20" />
        <path d="M32 6V58M6 32H58M14 14 50 50M14 50 50 14" />
        <path d="M32 17 47 32 32 47 17 32Z" />
        <circle cx="32" cy="32" r="7" />
      </g>
    </svg>
  );
}
