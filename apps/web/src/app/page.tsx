import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">Fiction Wars</h1>
        <p className="mt-2 text-muted-foreground">
          DC · Marvel · Anime · and more — who wins?
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Create a Room</CardTitle>
            <CardDescription>
              Start a new game and invite up to 5 friends.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/room/create">
              <Button className="w-full">Create Room</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Join a Room</CardTitle>
            <CardDescription>
              Enter a room code to join an existing game.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/room/join">
              <Button variant="outline" className="w-full">
                Join Room
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
