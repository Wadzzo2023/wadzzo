"use client";

import { type AuthError, AuthErrorCodes } from "firebase/auth";
import { useState } from "react";

import { useMutation } from "@tanstack/react-query";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { signIn } from "next-auth/react";
import { type SubmitHandler, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import { firebaseAuth } from "../firebase/client";
import { WalletType } from "../wallet-type";
import { showFirebaseAuthError } from "./firebase-error-toast";
import { Button } from "@wadzzo/ui/components/button";
import { Input } from "@wadzzo/ui/components/input";

const formSchema = z.object({
  email: z.email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormInputs = z.infer<typeof formSchema>;

interface EmailLoginFormProps {
  onForgotPassword?: () => void;
}

export function EmailLoginForm({ onForgotPassword }: EmailLoginFormProps) {
  const [verifyEmail, setVerifyEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInputs>({
    resolver: zodResolver(formSchema),
    defaultValues: {},
  });

  const loginMutation = useMutation({
    mutationFn: (data: FormInputs) => loginUser(data.email, data.password),
    onSuccess: async (res) => {
      if (res?.ok) {
        toast.success("Successfully logged in");
      }

      if (res?.error) {
        void showFirebaseAuthError({
          error: res.error,
          setVerifyEmail,
        });
      }
    },
    onError: (error: AuthError) => {
      const errorCode = error.code;
      if (errorCode === AuthErrorCodes.INVALID_PASSWORD) {
        toast.error("Invalid credentials");
      } else {
        toast.error(error.message);
      }
    },
  });

  async function loginUser(email: string, password: string) {
    await firebaseAuth.signOut();
    return await signIn("credentials", {
      redirect: false,
      password,
      email,
      walletType: WalletType.emailPass,
    });
  }

  const onSubmit: SubmitHandler<FormInputs> = (data) => {
    loginMutation.mutate(data);
  };

  return (
    <form className="flex w-full flex-col gap-3" onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-1">
        <label className="text-foreground text-xs font-medium">Email address</label>
        <div className="relative">
          <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            type="email"
            disabled={loginMutation.isPending}
            required
            {...register("email")}
            placeholder="you@example.com"
            className="bg-muted/50 pl-9"
          />
        </div>
        {errors.email && <p className="text-destructive text-xs">{errors.email.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-foreground text-xs font-medium">Password</label>
        <div className="relative">
          <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            type={showPassword ? "text" : "password"}
            disabled={loginMutation.isPending}
            required
            {...register("password")}
            placeholder="••••••••"
            className="bg-muted/50 pr-9 pl-9"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="text-destructive text-xs">{errors.password.message}</p>}
      </div>

      <div className="flex items-center justify-between">
        <label className="text-foreground flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="border-border accent-primary h-4 w-4 rounded"
          />
          Remember me
        </label>
        {onForgotPassword && (
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-primary text-sm font-medium hover:underline"
          >
            Forgot password?
          </button>
        )}
      </div>

      {verifyEmail && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          Check your email to verify your account.
        </p>
      )}

      <Button disabled={loginMutation.isPending} type="submit" className="w-full rounded-xl py-2.5">
        {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Sign In
      </Button>
    </form>
  );
}
