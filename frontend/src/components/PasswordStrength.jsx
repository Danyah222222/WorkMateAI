import { useMemo } from "react";

/**
 * PasswordStrength — inline hint + progress meter.
 * Policy (matches backend validate_password_strength): >= 8 chars, letter + number.
 * Returns null when value is empty so it doesn't clutter first render.
 */
export function passwordChecks(pw = "") {
  return {
    length: pw.length >= 8,
    letter: /[A-Za-z]/.test(pw),
    number: /\d/.test(pw),
  };
}

export function isPasswordStrong(pw = "") {
  const c = passwordChecks(pw);
  return c.length && c.letter && c.number;
}

export default function PasswordStrength({ value = "", className = "" }) {
  const checks = useMemo(() => passwordChecks(value), [value]);
  const score = (checks.length ? 1 : 0) + (checks.letter ? 1 : 0) + (checks.number ? 1 : 0);
  if (!value) return null;
  const colour = score <= 1 ? "bg-destructive" : score === 2 ? "bg-amber-500" : "bg-emerald-500";
  const label = score <= 1 ? "Weak" : score === 2 ? "Almost there" : "Strong";
  return (
    <div className={`space-y-2 ${className}`} data-testid="password-strength">
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full transition-all ${colour}`}
          style={{ width: `${(score / 3) * 100}%` }}
          data-testid="password-strength-bar"
        />
      </div>
      <ul className="text-xs text-muted-foreground grid grid-cols-1 sm:grid-cols-3 gap-1">
        <li className={checks.length ? "text-emerald-600" : ""} data-testid="pw-check-length">
          {checks.length ? "✓" : "•"} 8+ characters
        </li>
        <li className={checks.letter ? "text-emerald-600" : ""} data-testid="pw-check-letter">
          {checks.letter ? "✓" : "•"} contains a letter
        </li>
        <li className={checks.number ? "text-emerald-600" : ""} data-testid="pw-check-number">
          {checks.number ? "✓" : "•"} contains a number
        </li>
      </ul>
      <div className="text-[11px] text-muted-foreground" data-testid="password-strength-label">
        Strength: <span className="font-medium">{label}</span>
      </div>
    </div>
  );
}
