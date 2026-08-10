"use client";

import { cn } from "@/lib/utils";
import { AVATAR_IDS, type AvatarId } from "@fiction-wars/shared-types";

// Placeholder avatar colors — each id maps to a distinct accent.
// When real avatar images are added (Feature 16), swap backgroundColors
// for <Image src={avatarUrl} /> — no structural changes needed.
const AVATAR_COLORS: Record<AvatarId, string> = {
  "avatar-1": "bg-red-500",
  "avatar-2": "bg-blue-500",
  "avatar-3": "bg-green-500",
  "avatar-4": "bg-yellow-500",
  "avatar-5": "bg-purple-500",
  "avatar-6": "bg-pink-500",
  "avatar-7": "bg-orange-500",
  "avatar-8": "bg-teal-500",
};

interface Props {
  selected: AvatarId;
  onSelect: (id: AvatarId) => void;
}

export function AvatarPicker({ selected, onSelect }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {AVATAR_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className={cn(
            "h-10 w-10 rounded-full transition-all",
            AVATAR_COLORS[id],
            selected === id
              ? "ring-2 ring-foreground ring-offset-2"
              : "opacity-60 hover:opacity-100"
          )}
          aria-label={id}
        />
      ))}
    </div>
  );
}

export { AVATAR_COLORS };
