import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { JoinRoomForm } from "@/components/lobby/JoinRoomForm";

export default function JoinRoomPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join a Room</CardTitle>
          <CardDescription>
            Enter the room code your host shared with you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JoinRoomForm />
        </CardContent>
      </Card>
    </main>
  );
}