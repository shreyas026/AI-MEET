export function AnimatedBackground({
  variant = "default",
}: {
  variant?: "default" | "dense";
}) {
  const dense = variant === "dense";
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 bg-background" />
      <div className="bg-grid-faint absolute inset-0" />
      <div className="animate-aurora absolute -top-44 -left-40 h-[38rem] w-[38rem] rounded-full bg-primary/15 blur-3xl" />
      <div className="animate-float-slower absolute -right-36 top-1/4 h-[32rem] w-[32rem] rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="animate-float-slow absolute -bottom-44 left-1/4 h-[34rem] w-[34rem] rounded-full bg-emerald-500/10 blur-3xl" />
      {dense && (
        <>
          <div className="animate-aurora-reverse absolute -bottom-32 right-1/3 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
          <div className="animate-float-slow absolute top-10 left-1/2 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
        </>
      )}
      <div className="absolute inset-0 bg-[radial-gradient(80%_55%_at_50%_-10%,transparent_40%,var(--background)_100%)]" />
    </div>
  );
}
