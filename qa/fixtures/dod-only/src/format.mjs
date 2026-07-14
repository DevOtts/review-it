// Fixture build output — implements the PRD-mini DoD (correctly).
export const titlecase = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
export const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0].toUpperCase())
    .join(".") + ".";
