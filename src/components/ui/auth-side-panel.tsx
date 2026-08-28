// Shared illustration panel for /login and /signup — docs/frontend-design.md §4.
// Auth pages are always light: the illustration is a light image and dark mode starts
// after login. No DOM wordmark overlay — the artwork already carries the SabaqAI logo,
// tagline, and feature cards; overlaying text collided with them (verified on the
// narrow banner crop). `position` controls which edge survives the cover crop.

export default function AuthSidePanel({
  className = '',
  position = 'object-left',
}: {
  className?: string;
  position?: string;
}) {
  return (
    <div className={`relative overflow-hidden bg-page ${className}`}>
      <img
        src="/assets/auth-illustration.png"
        alt=""
        className={`absolute inset-0 h-full w-full object-cover ${position}`}
      />
    </div>
  );
}
