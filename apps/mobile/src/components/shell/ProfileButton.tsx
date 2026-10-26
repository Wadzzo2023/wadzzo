import { Image } from "expo-image";
import { router } from "expo-router";
import { User } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { useBountyAttention } from "~/lib/api/queries";
import { useSession } from "~/lib/auth/session";
import { cn } from "~/lib/utils";
import { useColors } from "~/theme/theme";

const AVATAR_FALLBACK = require("../../../assets/brand/wadzzo-mark.png");

/**
 * Profile isn't a tab — it's this avatar, top-right of every root screen
 * (port of the web's ProfileButton). Dot = a bounty win or brand reply you
 * haven't opened yet.
 */
export function ProfileButton({ className }: { className?: string }) {
  const { c } = useColors();
  const user = useSession((s) => s.user);
  const { count } = useBountyAttention();

  return (
    <Pressable
      onPress={() => router.push("/profile")}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Profile, ${count} new` : "Profile"}
      className={cn("h-9 w-9 items-center justify-center rounded-full border border-ar-line bg-ar-surface", className)}
    >
      {user ? (
        <Image
          source={user.image ? { uri: user.image } : AVATAR_FALLBACK}
          style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: c("ar-green", 0.5) }}
          contentFit="cover"
        />
      ) : (
        <User size={17} strokeWidth={2.2} color={c("ar-text-dim")} />
      )}
      {count > 0 && (
        <View
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-ar-bg bg-ar-green-hot"
        />
      )}
    </Pressable>
  );
}
