import { MIN_PLAYERS, MAX_PLAYERS, CARD_STAT_KEYS } from "@fiction-wars/shared-types";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-3xl font-semibold">Fiction Wars</h1>
      <p className="text-muted-foreground">
        {MIN_PLAYERS}–{MAX_PLAYERS} players &middot; stats: {CARD_STAT_KEYS.join(", ")}
      </p>
    </main>
  );
}
