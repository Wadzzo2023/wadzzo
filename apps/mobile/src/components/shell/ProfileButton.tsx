import { Image } from "expo-image";
import { router } from "expo-router";
import { Coins, User } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { useBalanceQuery, useBountyAttention } from "~/lib/api/queries";
import { Text } from "~/components/ui/Text";
import { formatAmount } from "~/lib/market";
import { useSession } from "~/lib/auth/session";
import { cn } from "~/lib/utils";
import { useColors } from "~/theme/theme";

const AVATAR_FALLBACK = require("../../../assets/brand/wadzzo-mark.png");

/**
 * Profile isn't a tab — it's this avatar, top-right of every root screen
 * (port of the web's ProfileButton). Dot = a bounty win or brand reply you
 * haven't opened yet.
 *
 * `balance` (the map) widens it into one capsule: your platform-token
 * balance, then the avatar, all of it opening the profile — as on the web.
 */
export function ProfileButton({ className, balance = false }: { className?: string; balance?: boolean }) {
  const { c } = useColors();
  const user = useSession((s) => s.user);
  const { count } = useBountyAttention();
  const withBalance = balance && Boolean(user);
  const bal = useBalanceQuery(withBalance);
  const data = withBalance ? bal.data : undefined;

  const avatar = user ? (
    <Image
      source={user.image ? { uri: user.image } : AVATAR_FALLBACK}
      style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: c("ar-green", 0.5) }}
      contentFit="cover"
    />
  ) : (
    <User size={17} strokeWidth={2.2} color={c("ar-text-dim")} />
  );
  const dot = count > 0 && <View className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-ar-bg bg-ar-green-hot" />;

  if (withBalance)
    return (
      <Pressable
        onPress={() => router.push("/profile")}
        accessibilityRole="button"
        accessibilityLabel={["Profile", data && `${formatAmount(data.balance)} ${data.assetCode}`, count > 0 && `${count} new`].filter(Boolean).join(", ")}
        className={cn("h-9 flex-row items-center gap-1.5 rounded-full border border-ar-line bg-ar-surface pl-2.5 pr-[2px]", className)}
      >
        <Coins size={13} strokeWidth={2.4} color={c("ar-green-hot")} />
        {bal.isPending ? (
          <View className="h-3 w-9 rounded-full bg-ar-line" />
        ) : !data ? (
          <Text className="font-hud text-[11px] font-bold text-ar-faint">—</Text>
        ) : (
          <View className="flex-row items-baseline gap-1">
            <Text className="font-hud text-[13px] font-bold text-ar-text">{formatAmount(data.balance)}</Text>
            <Text className="font-hud text-[8.5px] font-semibold uppercase tracking-[1px] text-ar-dim">{data.assetCode}</Text>
          </View>
        )}
        <View className="h-[30px] w-[30px] items-center justify-center">{avatar}</View>
        {dot}
      </Pressable>
    );

  return (
    <Pressable
      onPress={() => router.push("/profile")}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Profile, ${count} new` : "Profile"}
      className={cn("h-9 w-9 items-center justify-center rounded-full border border-ar-line bg-ar-surface", className)}
    >
      {avatar}
      {dot}
    </Pressable>
  );
}
