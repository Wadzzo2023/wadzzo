"use client";

import { motion } from "framer-motion";
import { Send } from "lucide-react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { type z } from "zod";
import { api } from "~/utils/api";
import { Button } from "@wadzzo/ui/poster/button";
import { Textarea } from "@wadzzo/ui/poster/textarea";
import { cn } from "@wadzzo/ui/lib/cn";
import { CommentSchema } from "../comment/add-post-comment";

export function AddReplyComment({ parentId, postId }: { parentId: number; postId: number }) {
  const commentMutation = api.fan.post.createComment.useMutation({
    onSuccess: () => {
      reset();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<z.infer<typeof CommentSchema>>({
    resolver: zodResolver(CommentSchema),
    defaultValues: { parentId, postId, content: "" },
  });

  const contentValue = watch("content");

  const onSubmit: SubmitHandler<z.infer<typeof CommentSchema>> = (data) => {
    commentMutation.mutate(data);
  };

  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
        <div className="relative">
          <Textarea
            {...register("content")}
            placeholder="Write a reply..."
            className="min-h-[60px] resize-none pr-10 text-sm"
          />

          <Button
            type="submit"
            size="sm"
            variant="default"
            className="absolute right-2 bottom-2 h-8 w-8 p-0"
            disabled={commentMutation.isPending || !contentValue?.trim()}
          >
            {commentMutation.isPending ? (
              <div className="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
            ) : (
              <Send size={16} />
            )}
            <span className="sr-only">Send reply</span>
          </Button>
        </div>

        {errors.content && <p className="text-destructive text-xs">{errors.content.message}</p>}
      </form>
    </motion.div>
  );
}
