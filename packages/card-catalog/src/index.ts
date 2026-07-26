// Placeholder entry point for Feature 1 (monorepo scaffold).
// Feature 3 fills this in with the Mongoose Card model, an access layer,
// and a seed script with placeholder multiverse data.
//
// GUARDRAIL: nothing outside this package should import mongoose directly —
// apps/server calls through this package's access layer only.

export const CARD_CATALOG_PACKAGE_READY = true as const;
