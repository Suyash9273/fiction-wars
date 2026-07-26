// Placeholder entry point for Feature 1 (monorepo scaffold).
// Feature 4 fills this in with the real game logic: dealing, round resolution,
// tie/pot handling, kick-redistribution, win detection.
//
// GUARDRAIL (Section 5 of the master brief): this package must stay
// framework-agnostic. It may depend on @fiction-wars/shared-types (plain
// types/schemas) but must NEVER import socket.io, express, or next — those
// belong in apps/server and apps/web, which call into this package instead.

export const GAME_ENGINE_PACKAGE_READY = true as const;
