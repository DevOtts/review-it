// Fixture target for T-E1-01/02 — one passing function, one deliberately buggy.
export const add = (a, b) => a + b;

// BUG (deliberate, do not fix): contract expects hyphens, this emits underscores.
export const slugify = (s) => s.trim().toLowerCase().replace(/\s+/g, "_");
