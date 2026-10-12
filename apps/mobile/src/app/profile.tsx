import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Camera, Coins, Footprints, LogOut, MonitorSmartphone, Moon, Pencil, Sun, Trash2, Users, Vibrate, Volume2, Wallet, Zap, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HoloCard } from "~/components/cards/HoloCard";
import { BackButton, ScreenHeader } from "~/components/shell/ScreenHeader";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { StatBlock } from "~/components/ui/Badges";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { Field, FormError } from "~/components/ui/Field";
import { Skeleton } from "~/components/ui/Skeleton";
import { Bevel, Grid } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { MuralPackSettings } from "~/components/murals/MuralPackSettings";
import { api } from "~/lib/api/client";
import { useBalanceQuery, useCollectedQuery, useProfileQuery } from "~/lib/api/queries";
import { uploadProfileImage } from "~/lib/api/upload";
import { useSettings } from "~/lib/ar/feedback";
import { RARITY_META, RARITY_ORDER } from "~/lib/ar/rarity";
import type { ArSettings } from "~/lib/ar/types";
import { useSession } from "~/lib/auth/session";
import { pickFromLibrary } from "~/lib/media";
import { useColors, useResolvedTheme, useThemePreference, type ThemePreference } from "~/theme/theme";

const AVATAR_FALLBACK = require("../../assets/brand/wadzzo-mark.png");

const THEME_OPTIONS: { value: ThemePreference; icon: LucideIcon; label: string }[] = [
  { value: "auto", icon: MonitorSmartphone, label: "System" },
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
];

const TOGGLES: { key: keyof ArSettings; icon: LucideIcon; title: string; body: string }[] = [
  { key: "autoCollect", icon: Zap, title: "Auto-collect", body: "Claim eligible drops as you walk past them, without opening AR." },
  { key: "followingOnly", icon: Users, title: "Following only", body: "Hide drops from brands you don't follow. Quieter map, fewer pins." },
  { key: "haptics", icon: Vibrate, title: "Haptics", body: "A short buzz on capture and when a pin comes into range." },
  { key: "sound", icon: Volume2, title: "Sound", body: "Capture chimes and rarity stings." },
];

const short = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`.toUpperCase();

/**
 * ── /profile ───────────────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's profile (a pushed screen — profile isn't a tab). Plus
 * the native-only pieces decided for the app: full profile editing (avatar,
 * cover, name, bio) and account deletion (App Store requirement).
 */
export default function ProfileScreen() {
  const user = useSession((s) => s.user);
  const requireAuth = useSession((s) => s.requireAuth);
  if (!user) return <SignedOut onSignIn={() => requireAuth("profile")} />;
  return <SignedIn />;
}

function SignedIn() {
  const { c, rarity: rc } = useColors();
  const theme = useResolvedTheme();
  const pref = useThemePreference();
  const settings = useSettings();
  const signOut = useSession((s) => s.signOut);
  const profile = useProfileQuery();
  const balance = useBalanceQuery();
  const collection = useCollectedQuery({ query: "", sort: "newest", pageSize: 6 });
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const p = profile.data;
  const counts = collection.facets?.counts;
  const total = collection.facets?.total ?? 0;

  return (
    <View className="flex-1 bg-ar-bg">
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        <ScreenHeader
          back
          eyebrow="Your account"
          title="Profile"
          trailing={
            <View className="items-end">
              <View className="mb-1 flex-row items-center gap-1.5">
                <Coins size={11} strokeWidth={2.4} color={c("ar-green-hot")} />
                <Text className="font-hud text-[10px] font-semibold uppercase tracking-[1.8px] text-ar-faint">{balance.data ? `${balance.data.assetCode} balance` : "Wadzzo balance"}</Text>
              </View>
              {balance.isLoading ? (
                <Skeleton className="h-[22px] w-20 rounded-[4px]" />
              ) : balance.isError ? (
                <Text className="font-hud text-[12px] font-bold text-ar-faint">Couldn't load</Text>
              ) : (
                <Text className="font-hud text-[22px] font-bold text-ar-green-hot" style={{ fontVariant: ["tabular-nums"] }}>
                  {balance.data?.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </Text>
              )}
            </View>
          }
        />

        {/* Identity */}
        <View className="mx-5 overflow-hidden rounded-ar-lg">
          {p?.coverImage ? <Image source={{ uri: p.coverImage }} style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} contentFit="cover" /> : null}
          <LinearGradient colors={[c("ar-green", 0.2), c("ar-surface"), c("ar-surface")]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { opacity: p?.coverImage ? 0.7 : 1 }]} />
          <Grid />
          <View className="flex-row items-center gap-3.5 p-4">
            <Image source={p?.image ? { uri: p.image } : AVATAR_FALLBACK} style={{ width: 62, height: 62, borderRadius: 18, borderWidth: 2, borderColor: c("ar-green", 0.4) }} contentFit="cover" />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-[17px] font-semibold text-ar-text">{p?.name ?? "…"}</Text>
              {p?.bio ? <Text numberOfLines={2} className="mt-0.5 text-[11.5px] leading-4 text-ar-dim">{p.bio}</Text> : null}
              <View className="mt-1.5 flex-row items-center gap-1.5 self-start rounded-full border border-ar-line px-2 py-[2px]" style={{ backgroundColor: c("ar-void", 0.5) }}>
                <Wallet size={9} strokeWidth={2.8} color={c("ar-text-dim")} />
                <Text className="font-hud text-[9.5px] font-semibold tracking-[1px] text-ar-dim">{p ? short(p.id) : ""}</Text>
              </View>
            </View>
            <Pressable onPress={() => setEditOpen(true)} accessibilityLabel="Edit profile" className="h-9 w-9 items-center justify-center rounded-full border border-ar-line bg-ar-surface">
              <Pencil size={15} strokeWidth={2.3} color={c("ar-text-dim")} />
            </Pressable>
          </View>
        </View>

        {/* Totals */}
        <View className="mx-5 mt-3 flex-row items-center justify-around rounded-ar border border-ar-line bg-ar-text/5 py-3">
          <StatBlock label="Collectibles" value={p?.collectedCount ?? total} accent />
          <View className="h-8 w-px bg-ar-line" />
          <StatBlock label="Following" value={p?.followingCount ?? 0} />
          <View className="h-8 w-px bg-ar-line" />
          <StatBlock label="Brands" value={collection.facets?.brands ?? 0} />
        </View>

        {/* Collection breakdown */}
        <Section title="Collection breakdown">
          <Bevel className="gap-2.5 rounded-ar p-3.5" style={{ borderRadius: 16 }}>
            {RARITY_ORDER.map((r) => {
              const n = counts?.[r] ?? 0;
              const pct = total ? (n / total) * 100 : 0;
              return (
                <View key={r} className="flex-row items-center gap-2.5">
                  <Text className="font-hud w-[68px] text-[9.5px] font-bold uppercase tracking-[1.2px]" style={{ color: rc(r) }}>{RARITY_META[r].label}</Text>
                  <View className="h-[5px] flex-1 overflow-hidden rounded-full bg-ar-surface-3">
                    <View style={{ width: `${pct}%`, height: "100%", borderRadius: 3, backgroundColor: rc(r) }} />
                  </View>
                  <Text className="font-hud w-5 text-right text-[11px] font-bold text-ar-dim" style={{ fontVariant: ["tabular-nums"] }}>{collection.isLoading ? "" : n}</Text>
                </View>
              );
            })}
          </Bevel>
        </Section>

        {/* Latest finds */}
        {(collection.isLoading || collection.pins.length > 0) && (
          <View className="mt-5">
            <View className="flex-row items-center justify-between px-5">
              <Text className="font-hud text-[9.5px] font-semibold uppercase tracking-[2.4px] text-ar-faint">Latest finds</Text>
              {collection.pins.length > 0 && (
                <ArLinkButton href="/collection" variant="ghost" size="sm">
                  See all
                </ArLinkButton>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
              {collection.isLoading
                ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="w-[132px] rounded-ar-lg" style={{ aspectRatio: 5 / 7 }} />)
                : collection.pins.slice(0, 6).map((pin) => (
                    <View key={pin.id} style={{ width: 132 }}>
                      <HoloCard pin={pin} oneFace onPress={() => router.push(`/collection/${pin.id}`)} />
                    </View>
                  ))}
            </ScrollView>
          </View>
        )}

        {/* Appearance */}
        <Section title="Appearance">
          <Bevel className="flex-row items-start gap-3 rounded-ar p-3.5" style={{ borderRadius: 16 }}>
            <IconTile icon={theme === "light" ? Sun : Moon} on />
            <View className="min-w-0 flex-1">
              <Text className="font-hud text-[12.5px] font-bold uppercase tracking-[1.2px] text-ar-text">Theme</Text>
              <Text className="mt-1 text-[11.5px] leading-5 text-ar-faint">{pref.preference === "auto" ? `Follows your device — currently ${theme}.` : "Set manually, independent of your device."}</Text>
              <View className="mt-3 flex-row gap-1 rounded-[12px] border border-ar-line-bright bg-ar-surface-3 p-1" accessibilityRole="radiogroup">
                {THEME_OPTIONS.map(({ value, icon: Icon, label }) => {
                  const active = pref.preference === value;
                  const fg = active ? c("ar-green-hot") : c("ar-text-faint");
                  return (
                    <Pressable key={value} onPress={() => pref.setPreference(value)} accessibilityRole="radio" accessibilityState={{ checked: active }} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-[9px] py-2" style={{ backgroundColor: active ? c("ar-green", 0.2) : "transparent" }}>
                      <Icon size={13} strokeWidth={2.4} color={fg} />
                      <Text className="font-hud text-[10px] font-bold uppercase tracking-[0.8px]" style={{ color: fg }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Bevel>
        </Section>

        {/* Settings */}
        <Section title="Settings">
          <Bevel className="rounded-ar" style={{ borderRadius: 16 }}>
            {TOGGLES.map(({ key, icon, title, body }, i) => {
              const on = Boolean(settings[key]);
              return (
                <Pressable key={key} onPress={() => settings.toggle(key)} accessibilityRole="switch" accessibilityState={{ checked: on }} className="flex-row items-start gap-3 p-3.5" style={{ borderTopWidth: i ? 1 : 0, borderColor: c("ar-line") }}>
                  <IconTile icon={icon} on={on} />
                  <View className="min-w-0 flex-1">
                    <Text className="font-hud text-[12.5px] font-bold uppercase tracking-[1.2px] text-ar-text">{title}</Text>
                    <Text className="mt-1 text-[11.5px] leading-5 text-ar-faint">{body}</Text>
                  </View>
                  <Switch on={on} />
                </Pressable>
              );
            })}
          </Bevel>
        </Section>

        <Section title="Downloads">
          <MuralPackSettings />
        </Section>

        <View className="mt-6 gap-2 px-5">
          <ArButton block icon={LogOut} onPress={() => void signOut().then(() => router.replace("/map"))}>
            Sign out
          </ArButton>
          <ArButton variant="ghost" block icon={Trash2} onPress={() => setDeleteOpen(true)}>
            Delete account
          </ArButton>
        </View>
      </ScrollView>

      <EditProfileSheet open={editOpen} onClose={() => setEditOpen(false)} />
      <DeleteAccountSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-5 px-5">
      <Text className="font-hud mb-2.5 text-[9.5px] font-semibold uppercase tracking-[2.4px] text-ar-faint">{title}</Text>
      {children}
    </View>
  );
}

function IconTile({ icon: Icon, on }: { icon: LucideIcon; on: boolean }) {
  const { c } = useColors();
  return (
    <View className="mt-px h-8 w-8 items-center justify-center rounded-[10px] border" style={{ borderColor: on ? c("ar-green", 0.5) : c("ar-line"), backgroundColor: on ? c("ar-green", 0.15) : c("ar-text", 0.04) }}>
      <Icon size={15} strokeWidth={2.2} color={on ? c("ar-green-hot") : c("ar-text-faint")} />
    </View>
  );
}

function Switch({ on }: { on: boolean }) {
  const { c } = useColors();
  return (
    <View className="mt-1 h-[22px] w-[38px] justify-center rounded-full border px-[2px]" style={{ borderColor: on ? c("ar-green", 0.6) : c("ar-line-bright"), backgroundColor: on ? c("ar-green", 0.35) : c("ar-surface-3") }}>
      <View className="h-4 w-4 rounded-full" style={{ backgroundColor: on ? c("ar-green-hot") : c("ar-text-faint"), alignSelf: on ? "flex-end" : "flex-start" }} />
    </View>
  );
}

function EditProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { c } = useColors();
  const qc = useQueryClient();
  const profile = useProfileQuery();
  const patchUser = useSession((s) => s.patchUser);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<{ uri: string; name: string; type: string; size: number } | null>(null);
  const [cover, setCover] = useState<{ uri: string; name: string; type: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = profile.data;

  useEffect(() => {
    if (!open || !p) return;
    setName(p.name && !/\.\.\./.test(p.name) ? p.name : "");
    setBio(p.bio ?? "");
    setAvatar(null);
    setCover(null);
    setError(null);
  }, [open, p]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string | null> = { bio: bio.trim() || null };
      if (name.trim().length >= 2) body.name = name.trim();
      if (avatar) body.image = await uploadProfileImage(avatar, "avatar");
      if (cover) body.coverImage = await uploadProfileImage(cover, "cover");
      await api("/me/profile", { method: "PATCH", body });
      patchUser({ ...(body.name ? { name: body.name } : {}), ...(body.image ? { image: body.image } : {}) });
      await qc.invalidateQueries({ queryKey: ["profile"] });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={busy ? () => undefined : onClose} dismissible={!busy} maxHeight="92%">
      <ScrollView className="px-5" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
        <Text className="font-hud mb-4 mt-1 text-[19px] font-bold text-ar-text">Edit profile</Text>
        <Pressable onPress={async () => { const f = await pickFromLibrary({}); if (f?.[0]) setCover(f[0]); }} className="h-[96px] overflow-hidden rounded-ar border border-dashed border-ar-line-bright">
          {(cover ?? p?.coverImage) ? <Image source={{ uri: cover?.uri ?? p!.coverImage! }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Grid />}
          <View className="absolute bottom-2 right-2 flex-row items-center gap-1.5 rounded-full border border-ar-line bg-ar-surface px-2.5 py-1">
            <Camera size={12} strokeWidth={2.4} color={c("ar-text-dim")} />
            <Text className="font-hud text-[9.5px] font-semibold uppercase tracking-[1.2px] text-ar-dim">Cover</Text>
          </View>
        </Pressable>
        <Pressable onPress={async () => { const f = await pickFromLibrary({ square: true }); if (f?.[0]) setAvatar(f[0]); }} className="-mt-8 ml-4 h-[76px] w-[76px]">
          <Image source={avatar ? { uri: avatar.uri } : p?.image ? { uri: p.image } : AVATAR_FALLBACK} style={{ width: 76, height: 76, borderRadius: 22, borderWidth: 3, borderColor: c("ar-surface") }} contentFit="cover" />
          <View className="absolute -bottom-1 -right-1 h-7 w-7 items-center justify-center rounded-full border border-ar-line bg-ar-surface-3">
            <Camera size={13} strokeWidth={2.4} color={c("ar-green-hot")} />
          </View>
        </Pressable>
        <View className="mt-4 gap-4">
          <Field label="Display name" value={name} onChangeText={setName} maxLength={100} autoCapitalize="words" />
          <View className="gap-1.5">
            <Text className="font-hud text-[10px] font-semibold uppercase tracking-[1.8px] text-ar-faint">Bio · {bio.length}/200</Text>
            <TextInput value={bio} onChangeText={setBio} maxLength={200} multiline placeholder="A line about you" placeholderTextColor={c("ar-text-faint")} className="min-h-[80px] rounded-ar border border-ar-line bg-ar-surface-2 p-3.5 text-[14px] text-ar-text" style={{ fontFamily: "Sora_400Regular", textAlignVertical: "top" }} />
          </View>
          <FormError message={error} />
        </View>
      </ScrollView>
      <View className="px-5 pt-3">
        <ArButton variant="primary" size="lg" block busy={busy} onPress={() => void save()}>
          Save
        </ArButton>
      </View>
    </BottomSheet>
  );
}

function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const signOut = useSession((s) => s.signOut);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setTyped("");
      setError(null);
    }
  }, [open]);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/me", { method: "DELETE" });
      await signOut();
      onClose();
      router.replace("/map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the account");
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet open={open} onClose={busy ? () => undefined : onClose} dismissible={!busy}>
      <View className="px-6 pb-2 pt-2">
        <Text className="font-hud text-[19px] font-bold text-ar-text">Delete your account?</Text>
        <Text className="mt-2 text-[13px] leading-5 text-ar-dim">
          This permanently removes your Wadzzo account: your collection, follows, bounty entries and comments. Your sign-in is deleted too. This can't be undone.
        </Text>
        <Field label='Type "DELETE" to confirm' value={typed} onChangeText={setTyped} autoCapitalize="characters" className="mt-5" />
        <View className="mt-3">
          <FormError message={error} />
        </View>
        <View className="mt-4 gap-2">
          <ArButton variant="danger" size="lg" block icon={Trash2} busy={busy} disabled={typed.trim() !== "DELETE"} onPress={() => void confirm()}>
            Delete forever
          </ArButton>
          <ArButton variant="ghost" block onPress={onClose} disabled={busy}>
            Keep my account
          </ArButton>
        </View>
      </View>
    </BottomSheet>
  );
}

function SignedOut({ onSignIn }: { onSignIn: () => void }) {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const perks: { icon: LucideIcon; text: string }[] = [
    { icon: Footprints, text: "Capture pins and keep them forever" },
    { icon: Zap, text: "Auto-collect drops as you walk past them" },
    { icon: Users, text: "Follow brands and see their private drops" },
    { icon: Wallet, text: "Redeem codes tied to your own wallet" },
  ];
  return (
    <View className="flex-1 bg-ar-bg">
      <Grid opacity={0.07} />
      <View style={{ position: "absolute", left: 20, top: insets.top + 16, zIndex: 20 }}>
        <BackButton />
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 28, paddingVertical: 60 }}>
        <View className="mb-7 flex-row self-center">
          {[0, 1, 2].map((i) => (
            <View key={i} className="h-[104px] w-[74px] rounded-[12px] border border-ar-line-bright bg-ar-surface-3" style={{ marginLeft: i ? -16 : 0, transform: [{ rotate: `${(i - 1) * 9}deg` }, { translateY: Math.abs(i - 1) * 5 }] }} />
          ))}
        </View>
        <Text className="font-hud text-center text-[23px] font-bold text-ar-text">Start a collection</Text>
        <Text className="mx-auto mt-2 max-w-[19rem] text-center text-[13px] leading-5 text-ar-dim">Browse as much as you like. An account is only needed the moment you want to keep something.</Text>
        <View className="mx-auto mt-6 w-full max-w-[20rem] gap-2.5">
          {perks.map(({ icon: Icon, text }) => (
            <View key={text} className="flex-row items-center gap-3">
              <View className="h-7 w-7 items-center justify-center rounded-[9px] border" style={{ borderColor: c("ar-green", 0.4), backgroundColor: c("ar-green", 0.1) }}>
                <Icon size={13} strokeWidth={2.3} color={c("ar-green-hot")} />
              </View>
              <Text className="flex-1 text-[12.5px] leading-5 text-ar-dim">{text}</Text>
            </View>
          ))}
        </View>
        <View className="mt-7 gap-2">
          <ArButton variant="primary" size="lg" block icon={Wallet} onPress={onSignIn}>
            Sign in
          </ArButton>
          <ArLinkButton href="/map" variant="ghost" block>
            Keep browsing
          </ArLinkButton>
        </View>
      </ScrollView>
    </View>
  );
}
