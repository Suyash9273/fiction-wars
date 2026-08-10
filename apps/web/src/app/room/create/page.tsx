import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateRoomForm } from "@/components/lobby/CreateRoomForm";

export default function CreateRoomPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create a Room</CardTitle>
          <CardDescription>
            Set your preferences and invite friends with the room code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateRoomForm />
        </CardContent>
      </Card>
    </main>
  );
}