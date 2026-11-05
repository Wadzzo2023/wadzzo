"use client";

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail, CheckCircle } from "lucide-react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { clearAuthNotice, showAuthError, showAuthSuccess } from "./auth-notice";
import { z } from "zod";
import { type AuthError, sendPasswordResetEmail } from "firebase/auth";

import { firebaseAuth } from "../firebase/client";
import { useResetPasswordStore } from "../state/reset-password-store";
import { Button } from "@wadzzo/ui/components/button";
import { Input } from "@wadzzo/ui/components/input";

const formSchema = z.object({
  email: z.email("Please enter a valid email"),
});

type FormInputs = z.infer<typeof formSchema>;

const COOLDOWN_SECONDS = 30;

export function ForgotPasswordForm() {
  const [emailSent, setEmailSent] = useState(false);
  const { startCooldown, cooldownRemaining, updateCooldownRemaining } = useResetPasswordStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInputs>({
    resolver: zodResolver(formSchema),
  });

  useEffect(() => {
    updateCooldownRemaining();

    const timer = setInterval(() => {
      updateCooldownRemaining();
    }, 1000);

    return () => clearInterval(timer);
  }, [updateCooldownRemaining]);

  const resetMutation = useMutation({
    onMutate: () => clearAuthNotice(),
    mutationFn: ({ email }: { email: string }) => sendPasswordResetEmail(firebaseAuth, email),
    onSuccess: () => {
      showAuthSuccess("Password reset email sent!");
      setEmailSent(true);
      startCooldown(COOLDOWN_SECONDS);
    },
    onError: (error: AuthError) => {
      showAuthError(error.message);
    },
  });

  const onSubmit: SubmitHandler<FormInputs> = (data) => {
    if (cooldownRemaining > 0) return;
    resetMutation.mutate({ email: data.email });
  };

  const isDisabled = resetMutation.isPending || cooldownRemaining > 0;

  return (
    <form className="flex w-full flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="mb-2 text-center">
        <Mail className="text-muted-foreground mx-auto mb-2 h-12 w-12" />
        <h3 className="text-lg font-semibold">Reset your password</h3>
        <p className="text-muted-foreground text-sm">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>
      </div>

      <div className="space-y-1">
        <Input
          type="email"
          disabled={resetMutation.isPending}
          required
          {...register("email")}
          placeholder="Enter your email"
          className="w-full"
        />
        {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
      </div>

      {emailSent && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>Check your email for the password reset link.</span>
        </div>
      )}

      <Button disabled={isDisabled} type="submit" className="w-full">
        {resetMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s to resend` : "Send Reset Link"}
      </Button>

      {cooldownRemaining > 0 && (
        <p className="text-muted-foreground text-center text-xs">
          You can request another reset email in {cooldownRemaining} seconds.
        </p>
      )}
    </form>
  );
}
