import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Image } from "expo-image";
import { CornerDownRight, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Skeleton } from "~/components/ui/Skeleton";
import { Text } from "~/components/ui/Text";
import { api } from "~/lib/api/client";
import { useCommentsQuery } from "~/lib/api/queries";
import type { Reply } from "~/lib/api/types";
import { useColors } from "~/theme/theme";

const FALLBACK = require("../../../assets/brand/wadzzo-mark.png");

/** Port of the web DiscussionPanel: public thread, one level of replies. */
export function DiscussionPanel({ bountyId, onReply }: { bountyId: number; onReply: (t: { id: number; name: string }) => void }) {
  const { c } = useColors();
  const comments = useCommentsQuery(bountyId);
  if (comments.isLoading) {
    return (
      <View className="gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </View>
    );
  }
  if (comments.isError) return <Text className="rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-2.5 text-[12px] text-ar-danger">Couldn't load the discussion.</Text>;
  const list = comments.data ?? [];
  if (!list.length) return <Text className="py-10 text-center text-[12.5px] text-ar-faint">No comments yet. Start the conversation.</Text>;
  return (
    <View className="gap-4">
      {list.map((cm) => (
        <View key={cm.id}>
          <Row comment={cm} bountyId={bountyId} />
          <View className="ml-10 mt-1.5">
            <Pressable onPress={() => onReply({ id: cm.id, name: cm.author.name ?? "them" })} className="flex-row items-center gap-1 self-start">
              <CornerDownRight size={11} strokeWidth={2.5} color={c("ar-text-faint")} />
              <Text className="font-hud text-[10px] font-semibold uppercase tracking-[1.2px] text-ar-faint">Reply</Text>
            </Pressable>
            {cm.replies.length > 0 && (
              <View className="mt-2.5 gap-3 border-l border-ar-line pl-3">
                {cm.replies.map((r) => (
                  <Row key={r.id} comment={r} bountyId={bountyId} small />
                ))}
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function Row({ comment, bountyId, small }: { comment: Reply; bountyId: number; small?: boolean }) {
  const { c } = useColors();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const size = small ? 24 : 30;
  return (
    <View className="flex-row gap-2.5">
      <Image source={comment.author.image ? { uri: comment.author.image } : FALLBACK} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-baseline gap-2">
          <Text numberOfLines={1} className="shrink text-[12.5px] font-semibold text-ar-text">{comment.author.name ?? "Anonymous"}</Text>
          <Text className="font-hud text-[10px] text-ar-faint">{formatDistanceToNowStrict(new Date(comment.createdAt))}</Text>
          {comment.mine && (
            <Pressable
              onPress={async () => {
                if (!confirming) return setConfirming(true);
                await api(`/comments/${comment.id}`, { method: "DELETE" }).catch(() => undefined);
                await qc.invalidateQueries({ queryKey: ["comments"] });
                setConfirming(false);
              }}
              className="ml-auto flex-row items-center gap-1"
              accessibilityLabel={confirming ? "Confirm delete" : "Delete comment"}
            >
              <Trash2 size={11} strokeWidth={2.4} color={confirming ? c("ar-danger") : c("ar-text-faint")} />
              {confirming && <Text className="font-hud text-[10px] font-semibold uppercase text-ar-danger">Delete?</Text>}
            </Pressable>
          )}
        </View>
        <Text className="mt-0.5 text-[13px] leading-5 text-ar-dim">{comment.content}</Text>
      </View>
    </View>
  );
}
