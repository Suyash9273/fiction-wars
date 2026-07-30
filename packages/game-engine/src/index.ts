// Public API of the game-engine package.
//
// GUARDRAIL (Section 5): this package must stay framework-agnostic.
// It may depend on @fiction-wars/shared-types (plain types/schemas) but
// must NEVER import socket.io, express, mongoose, or next — those belong
// in apps/server and apps/web, which call into this package instead.

export type { EnginePlayer, EngineState, RoundResult, EngineResult } from "./types.js";
export { buildDeck, shuffleMathRandom, shuffleCryptoRandom } from "./deck.js";
export { resolveRound, bestStatForCard } from "./round.js";
export { redistributePile } from "./kick.js";
export { computeSummary } from "./summary.js";
export { totalCards } from "./invariants.js";
