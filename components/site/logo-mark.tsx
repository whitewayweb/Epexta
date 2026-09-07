export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid -skew-y-[14deg] gap-[3px] ${className ?? "w-5"}`}
    >
      <b className="block h-[4px] w-full rounded-full bg-primary" />
      <b className="block h-[4px] w-[70%] rounded-full bg-primary" />
      <b className="block h-[4px] w-full rounded-full bg-primary" />
    </span>
  );
}
