import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { Clock, Lock, Send, Share2, Trophy, Users, Wallet, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { ChatPanel } from "~/components/bounty/ChatPanel";
import { DiscussionPanel } from "~/components/bounty/DiscussionPanel";
import { EntriesPanel } from "~/components/bounty/EntriesPanel";
import { EntrySheet } from "~/components/bounty/EntrySheet";
import { RichText } from "~/components/bounty/RichText";
import { Confetti } from "~/components/fx/Confetti";
import { BackButton } from "~/components/shell/ScreenHeader";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { StatBlock, TonePill } from "~/components/ui/Badges";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { Skeleton } from "~/components/ui/Skeleton";
import { Glass, Grid } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { api } from "~/lib/api/client";
import { useBalanceQuery, useBountyAttention, useBountyQuery, useBountySeen, useThreadQuery } from "~/lib/api/queries";
import type { BountyDetail, Entry } from "~/lib/api/types";
import { deadlineLabel, formatAmount, formatUsd, viewerBadge } from "~/lib/ar/bounty";
import { useSession } from "~/lib/auth/session";
import { useColors } from "~/theme/theme";

type Section = "brief" | "entries" | "chat" | "discussion";
const SECTIONS: Section[] = ["brief", "entries", "chat", "discussion"];

/**
 * ── /bounty/[id] ───────────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's bounty page: one bounty and one clear next step. The
 * pinned bar always says the single thing you can do now; on Chat/Talk it
 * becomes the message box. Mine and Chat are locked until you join.
 */
export default function BountyScreen() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; section?: string }>();
  const id = Number(params.id);
  const user = useSession((s) => s.user);
  const requireAuth = useSession((s) => s.requireAuth);
  const [section, setSection] = useState<Section>(SECTIONS.includes(params.section as Section) ? (params.section as Section) : "brief");
  const [sheet, setSheet] = useState<{ open: boolean; editing: Entry | null }>({ open: false, editing: null });
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);

  const detail = useBountyQuery(id);
  const bounty = detail.data;
  const joined = Boolean(bounty?.viewer.joined);
  const thread = useThreadQuery(id, joined && section === "chat");

  // Seen + first-win celebration.
  const { unseen, ready } = useBountyAttention();
  const markSeen = useBountySeen((s) => s.markSeen);
  const [confetti, setConfetti] = useState(0);
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!bounty || !ready || handled.current === bounty.id) return;
    handled.current = bounty.id;
    if (unseen.some((u) => u.kind === "won" && u.bountyId === bounty.id)) setConfetti((n) => n + 1);
    markSeen(bounty.id);
  }, [bounty, ready, unseen, markSeen]);
  useEffect(() => {
    if (section === "chat" && thread.dataUpdatedAt && Number.isInteger(id)) markSeen(id);
  }, [section, thread.dataUpdatedAt, id, markSeen]);

  if (detail.isLoading) {
    return (
      <View className="flex-1 bg-ar-bg">
        <Skeleton className="h-[220px] w-full rounded-none" />
        <View className="px-5">
          <Skeleton className="-mt-8 h-[56px] w-[56px] rounded-[16px]" />
          <Skeleton className="mt-3 h-5 w-4/5 rounded-full" />
          <Skeleton className="mt-3 h-5 w-24 rounded-full" />
          <Skeleton className="mt-4 h-[118px] w-full rounded-ar-lg" />
          <Skeleton className="mt-5 h-11 w-full" />
        </View>
      </View>
    );
  }
  if (!bounty) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-ar-bg px-8">
        <Text className="font-hud text-[15px] font-bold uppercase tracking-[1.8px] text-ar-dim">{(detail.error as { status?: number } | null)?.status === 404 ? "Bounty not found" : "Couldn't load this bounty"}</Text>
        <ArLinkButton href="/bounty" variant="primary">
          All bounties
        </ArLinkButton>
      </View>
    );
  }

  const badge = viewerBadge(bounty);
  const deadline = deadlineLabel(bounty.endDate);
  const locked = !joined && (section === "entries" || section === "chat");

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} className="bg-ar-bg">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Hero bounty={bounty} topInset={insets.top} />
        <View className="-mt-8 px-5">
          <Pressable onPress={() => router.push(`/brands/${bounty.brand.id}`)} className="flex-row items-end gap-2.5 self-start">
            <BrandAvatar src={bounty.brand.avatarUrl} style={{ width: 56, height: 56, borderRadius: 16, borderWidth: 3, borderColor: c("ar-bg") }} />
            <Text className="font-hud mb-1 text-[11px] font-semibold uppercase tracking-[1.5px] text-ar-dim">{bounty.brand.name}</Text>
          </Pressable>
          <Text className="mt-3 text-[21px] font-semibold leading-7 text-ar-text">{bounty.title}</Text>
          <View className="mt-2.5 flex-row flex-wrap items-center gap-2">
            <TonePill tone={badge.tone} label={badge.label} />
            {deadline && <TonePill tone={deadline.urgent ? "gold" : "muted"} label={deadline.text} icon={<Clock size={10} strokeWidth={2.6} color={deadline.urgent ? c("rarity-legendary") : c("ar-text-faint")} />} />}
          </View>
        </View>

        <View className="mx-5 mt-4 overflow-hidden rounded-ar-lg border" style={{ borderColor: c("ar-green", 0.3) }}>
          <LinearGradient colors={[c("ar-green", 0.15), c("ar-surface"), c("ar-surface")]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View className="flex-row items-end justify-between px-4 pb-3 pt-3.5">
            <View>
              <Text className="font-hud text-[9.5px] font-semibold uppercase tracking-[2.2px] text-ar-faint">Reward per winner</Text>
              <Text className="font-hud mt-1 text-[30px] font-bold text-ar-green-hot" style={{ fontVariant: ["tabular-nums"] }}>{formatUsd(bounty.rewardUsd)}</Text>
            </View>
            <Text className="font-hud mb-0.5 text-[11px] font-semibold text-ar-dim">
              {formatAmount(bounty.rewardAsset)} {bounty.assetCode}
            </Text>
          </View>
          <View className="flex-row items-center justify-around border-t border-ar-line py-2.5">
            <StatBlock label="Spots left" value={`${bounty.spotsLeft}/${bounty.totalWinners}`} accent={bounty.open} />
            <View className="h-7 w-px bg-ar-line" />
            <StatBlock label="Joined" value={bounty.participants} />
            <View className="h-7 w-px bg-ar-line" />
            <StatBlock label="Entries" value={bounty.totalEntries} />
          </View>
        </View>

        {bounty.viewer.won && (
          <Animated.View entering={FadeInDown} className="mx-5 mt-3 flex-row items-center gap-3 rounded-ar-lg border p-3.5" style={{ borderColor: c("rarity-legendary", 0.5), backgroundColor: c("rarity-legendary", 0.1) }}>
            <View className="h-10 w-10 items-center justify-center rounded-[12px]" style={{ backgroundColor: c("rarity-legendary", 0.2) }}>
              <Trophy size={19} strokeWidth={2.3} color={c("rarity-legendary")} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[14px] font-semibold text-ar-text">You won this bounty</Text>
              <Text className="mt-0.5 text-[12px] leading-5 text-ar-dim">
                {formatAmount(bounty.rewardAsset)} {bounty.assetCode} has been sent to your wallet.
              </Text>
            </View>
          </Animated.View>
        )}

        <SegmentedTabs
          className="mx-5 mt-5"
          value={section}
          onChange={setSection}
          tabs={[
            { id: "brief", label: "Brief" },
            { id: "entries", label: "Mine", count: joined ? bounty.viewer.entryCount : undefined, icon: joined ? undefined : Lock },
            { id: "chat", label: "Chat", icon: joined ? undefined : Lock },
            { id: "discussion", label: "Talk", count: bounty.commentCount || undefined },
          ]}
        />

        <View className="px-5 pt-4">
          {locked ? (
            <View className="items-center py-10">
              <View className="h-11 w-11 items-center justify-center rounded-full border border-ar-line-bright bg-ar-text/5">
                <Lock size={17} strokeWidth={2.3} color={c("ar-text-faint")} />
              </View>
              <Text className="font-hud mt-3 text-[13px] font-bold uppercase tracking-[1.8px] text-ar-dim">Join to unlock</Text>
              <Text className="mt-1.5 max-w-[17rem] text-center text-[12.5px] leading-5 text-ar-faint">
                {section === "chat" ? "Once you've joined you can message the brand privately about this bounty." : "Once you've joined, the entries you send and how they're doing in review show up here."}
              </Text>
            </View>
          ) : section === "brief" ? (
            <View>
              <RichText html={bounty.description} />
              {bounty.requiredBalance > 0 && (
                <View className="mt-4 flex-row items-start gap-2 rounded-ar border border-ar-line bg-ar-text/5 px-3.5 py-2.5">
                  <Wallet size={14} strokeWidth={2.3} color={c("ar-green-hot")} style={{ marginTop: 2 }} />
                  <Text className="flex-1 text-[12px] leading-5 text-ar-dim">
                    To join you need to hold at least {formatAmount(bounty.requiredBalance)} {bounty.assetCode} in your wallet.
                  </Text>
                </View>
              )}
            </View>
          ) : section === "entries" ? (
            <EntriesPanel bountyId={bounty.id} open={bounty.open} onEdit={(e) => setSheet({ open: true, editing: e })} />
          ) : section === "chat" ? (
            <ChatPanel messages={thread.data} loading={thread.isLoading} brand={bounty.brand} />
          ) : (
            <DiscussionPanel
              bountyId={bounty.id}
              onReply={(t) => {
                if (!requireAuth("bounty", () => setReplyTo(t))) return;
                setReplyTo(t);
              }}
            />
          )}
        </View>
      </ScrollView>

      <View className="rounded-t-ar-xl border border-b-0 border-ar-line bg-ar-surface px-4 pt-3" style={{ paddingBottom: Math.max(12, insets.bottom) }}>
        {section === "chat" && joined ? (
          <Composer bountyId={bounty.id} kind="chat" placeholder={`Message ${bounty.brand.name}`} />
        ) : section === "discussion" && user ? (
          <Composer key={`talk-${replyTo?.id ?? 0}`} bountyId={bounty.id} kind="comment" placeholder={replyTo ? `Reply to ${replyTo.name}` : "Add to the discussion"} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSent={() => setReplyTo(null)} />
        ) : (
          <PrimaryAction bounty={bounty} onSubmit={() => { setSection("entries"); setSheet({ open: true, editing: null }); }} onShowEntries={() => setSection("entries")} />
        )}
      </View>

      <EntrySheet bountyId={bounty.id} open={sheet.open} editing={sheet.editing} onClose={() => setSheet({ open: false, editing: null })} />
      <Confetti trigger={confetti} rarity="legendary" />
    </KeyboardAvoidingView>
  );
}

function Hero({ bounty, topInset }: { bounty: BountyDetail; topInset: number }) {
  const { c } = useColors();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const images = bounty.imageUrls;
  return (
    <View style={{ height: 220 }}>
      {images.length ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))} scrollEventThrottle={32}>
          {images.map((src) => (
            <Image key={src} source={{ uri: src }} style={{ width, height: 220 }} contentFit="cover" />
          ))}
        </ScrollView>
      ) : (
        <>
          <LinearGradient colors={[c("ar-green", 0.25), c("ar-surface"), c("ar-bg")]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Grid />
        </>
      )}
      <LinearGradient pointerEvents="none" colors={[c("ar-void", 0.7), c("ar-bg", 0), c("ar-bg")]} style={StyleSheet.absoluteFill} />
      {images.length > 1 && (
        <View pointerEvents="none" style={{ position: "absolute", bottom: 44, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 }}>
          {images.map((src, i) => (
            <View key={src} style={{ height: 6, width: i === index ? 16 : 6, borderRadius: 3, backgroundColor: i === index ? c("ar-text") : c("ar-text", 0.4) }} />
          ))}
        </View>
      )}
      <View style={{ position: "absolute", left: 16, right: 16, top: topInset + 14, flexDirection: "row", justifyContent: "space-between" }}>
        <BackButton fallback="/bounty" />
        <Pressable onPress={() => void Share.share({ title: bounty.title, message: bounty.title })} accessibilityLabel="Share this bounty">
          <Glass style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
            <Share2 size={15} strokeWidth={2.2} color={c("ar-text")} />
          </Glass>
        </Pressable>
      </View>
    </View>
  );
}

/** The one thing you can do next — in the order a fan meets the obstacles. */
function PrimaryAction({ bounty, onSubmit, onShowEntries }: { bounty: BountyDetail; onSubmit: () => void; onShowEntries: () => void }) {
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const requireAuth = useSession((s) => s.requireAuth);
  const needsBalance = bounty.requiredBalance > 0 && !bounty.viewer.joined;
  const balance = useBalanceQuery(needsBalance && bounty.open);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const note = (t: string) => <Text className="font-hud mb-2 text-center text-[10px] font-semibold uppercase tracking-[1.2px] text-ar-faint">{t}</Text>;

  const join = async () => {
    setJoining(true);
    setError(null);
    try {
      await api(`/bounties/${bounty.id}/join`, { method: "POST" });
      await Promise.all(["bounty", "myBounties", "bounties"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join");
    } finally {
      setJoining(false);
    }
  };

  if (bounty.isOwner) {
    return (
      <>
        {note("You posted this bounty")}
        <ArButton block size="lg" disabled>
          Manage it on Wadzzo
        </ArButton>
      </>
    );
  }
  if (bounty.viewer.won) {
    return (
      <ArButton block size="lg" variant="gold" icon={Trophy} onPress={onShowEntries}>
        See your entries
      </ArButton>
    );
  }
  if (!bounty.open) {
    return (
      <>
        {bounty.viewer.joined && note("No more entries — results are final")}
        <ArButton block size="lg" disabled>
          Bounty closed
        </ArButton>
      </>
    );
  }
  if (!user) {
    return (
      <ArButton block size="lg" variant="primary" icon={Wallet} onPress={() => requireAuth("bounty")}>
        Sign in to join
      </ArButton>
    );
  }
  if (!bounty.viewer.joined) {
    if (needsBalance && balance.isLoading) {
      return (
        <ArButton block size="lg" variant="primary" busy>
          Checking balance
        </ArButton>
      );
    }
    const short = needsBalance && balance.data ? bounty.requiredBalance - balance.data.balance : 0;
    if (short > 0) {
      return (
        <>
          {note(`You hold ${formatAmount(balance.data!.balance)} ${bounty.assetCode}`)}
          <ArButton block size="lg" disabled>
            {`Need ${formatAmount(short)} more ${bounty.assetCode}`}
          </ArButton>
        </>
      );
    }
    return (
      <>
        {error && <Text className="mb-2 text-center text-[12px] text-ar-danger">{error}</Text>}
        <ArButton block size="lg" variant="primary" icon={Users} busy={joining} onPress={() => void join()}>
          {joining ? "Joining" : "Join bounty"}
        </ArButton>
      </>
    );
  }
  return (
    <ArButton block size="lg" variant="primary" icon={Send} onPress={onSubmit}>
      {bounty.viewer.entryCount > 0 ? "Send another entry" : "Send your entry"}
    </ArButton>
  );
}

function Composer({ bountyId, kind, placeholder, replyTo, onCancelReply, onSent }: { bountyId: number; kind: "chat" | "comment"; placeholder: string; replyTo?: { id: number; name: string } | null; onCancelReply?: () => void; onSent?: () => void }) {
  const { c } = useColors();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const content = text.trim();
    if (!content || pending) return;
    setPending(true);
    setError(null);
    try {
      if (kind === "chat") {
        await api(`/bounties/${bountyId}/thread`, { method: "POST", body: { content } });
        await qc.invalidateQueries({ queryKey: ["thread"] });
      } else {
        await api(`/bounties/${bountyId}/comments`, { method: "POST", body: { content, parentId: replyTo?.id } });
        await Promise.all(["comments", "bounty"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      }
      setText("");
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setPending(false);
    }
  };
  return (
    <View>
      {replyTo && (
        <View className="mb-2 flex-row items-center justify-between rounded-full bg-ar-text/5 px-3 py-1.5">
          <Text numberOfLines={1} className="text-[11.5px] text-ar-dim">
            Replying to <Text className="text-ar-text">{replyTo.name}</Text>
          </Text>
          <Pressable onPress={onCancelReply} accessibilityLabel="Cancel reply" hitSlop={8}>
            <X size={14} strokeWidth={2.4} color={c("ar-text-faint")} />
          </Pressable>
        </View>
      )}
      {error && <Text className="mb-2 text-[12px] text-ar-danger">{error}</Text>}
      <View className="flex-row items-end gap-2">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={c("ar-text-faint")}
          multiline
          maxLength={kind === "chat" ? 2000 : 1000}
          autoFocus={Boolean(replyTo)}
          accessibilityLabel={placeholder}
          className="max-h-28 min-h-[44px] flex-1 rounded-[22px] border border-ar-line bg-ar-surface-2 px-4 py-3 text-[14px] text-ar-text"
          style={{ fontFamily: "Sora_400Regular" }}
        />
        <Pressable
          onPress={() => void submit()}
          disabled={!text.trim() || pending}
          accessibilityLabel="Send"
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: c("ar-green"), opacity: !text.trim() || pending ? 0.4 : 1 }}
        >
          <Send size={17} strokeWidth={2.3} color={c("ar-green-ink")} />
        </Pressable>
      </View>
    </View>
  );
}
