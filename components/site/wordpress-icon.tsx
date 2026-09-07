export function WordPressIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        fill="currentColor"
        d="M4.75 8.3h1.9l1.85 6.55 1.55-4.9-.65-1.65h1.75l1.95 6.55 1.7-6.55h1.75l-2.75 9h-1.5l-1.8-5.75-1.85 5.75h-1.5z"
      />
    </svg>
  );
}
