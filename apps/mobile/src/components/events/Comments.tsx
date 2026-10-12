import { formatDistanceToNowStrict } from "date-fns";
import { Image } from "expo-image";
import { Send, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Skeleton } from "~/components/ui/Skeleton";
import { Text } from "~/components/ui/Text";
import { useAddEventComment, useDeleteEventComment, useEventCommentsQuery } from "~/lib/api/queries";
import type { ArCommentTarget, EventComment } from "~/lib/api/types";
import { useSession } from "~/lib/auth/session";
import { useColors } from "~/theme/theme";

const FALLBACK = require("../../../assets/brand/wadzzo-mark.png");

/** Port of the web CommentsSection: flat thread, composer above, newest first. */
export function CommentsSection({ target }: { target: ArCommentTarget }) {
  const comments = useEventCommentsQuery(target);
  const list = comments.data ?? [];
  return (
    <View>
      <Text className="font-hud mb-3 text-[9.5px] font-semibold uppercase tracking-[2.4px] text-ar-green">
        Comments{list.length > 0 ? ` · ${list.length}` : ""}
      </Text>
      <Composer target={target} />
      <View className="mt-4">
        {comments.isLoading ? (
          <View className="gap-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </View>
        ) : comments.isError ? (
          <Text className="rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-2.5 text-[12px] text-ar-danger">Couldn&rsquo;t load comments.</Text>
        ) : list.length === 0 ? (
          <Text className="py-6 text-center text-[12.5px] text-ar-faint">No comments yet. Say something.</Text>
        ) : (
          <View className="gap-4">
            {list.map((cm) => (
              <Row key={cm.id} comment={cm} target={target} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function Composer({ target }: { target: ArCommentTarget }) {
  const { c } = useColors();
  const user = useSession((s) => s.user);
  const requireAuth = useSession((s) => s.requireAuth);
  const add = useAddEventComment(target);
  const [text, setText] = useState("");

  if (!user) {
    return (
      <Pressable onPress={() => requireAuth("events")} className="h-11 justify-center rounded-[22px] border border-ar-line bg-ar-surface-2 px-4">
        <Text className="text-[13px] text-ar-faint">Sign in to comment</Text>
      </Pressable>
    );
  }

  const submit = () => {
    const content = text.trim();
    if (!content || add.isPending) return;
    add.mutate(content, { onSuccess: () => setText("") });
  };

  return (
    <View>
      {add.error && <Text className="mb-2 text-[12px] text-ar-danger">{add.error.message}</Text>}
      <View className="flex-row items-end gap-2">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Add a comment"
          placeholderTextColor={c("ar-text-faint")}
          multiline
          maxLength={1000}
          accessibilityLabel="Add a comment"
          className="max-h-28 min-h-[44px] flex-1 rounded-[22px] border border-ar-line bg-ar-surface-2 px-4 py-3 text-[14px] text-ar-text"
          style={{ fontFamily: "Sora_400Regular" }}
        />
        <Pressable
          onPress={submit}
          disabled={!text.trim() || add.isPending}
          accessibilityLabel="Post comment"
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: c("ar-green"), opacity: !text.trim() || add.isPending ? 0.4 : 1 }}
        >
          <Send size={17} strokeWidth={2.3} color={c("ar-green-ink")} />
        </Pressable>
      </View>
    </View>
  );
}

function Row({ comment, target }: { comment: EventComment; target: ArCommentTarget }) {
  const { c } = useColors();
  const remove = useDeleteEventComment(target);
  const [confirming, setConfirming] = useState(false);
  return (
    <View className="flex-row gap-2.5">
      <Image source={comment.author.image ? { uri: comment.author.image } : FALLBACK} style={{ width: 30, height: 30, borderRadius: 15 }} contentFit="cover" />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-baseline gap-2">
          <Text numberOfLines={1} className="shrink text-[12.5px] font-semibold text-ar-text">{comment.author.name ?? "Anonymous"}</Text>
          <Text className="font-hud text-[10px] text-ar-faint">{formatDistanceToNowStrict(new Date(comment.createdAt))}</Text>
          {comment.mine && (
            <Pressable
              onPress={() => (confirming ? remove.mutate(comment.id) : setConfirming(true))}
              disabled={remove.isPending}
              className="ml-auto flex-row items-center gap-1"
              accessibilityLabel={confirming ? "Confirm delete" : "Delete comment"}
              hitSlop={8}
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
