"use client";

import {
  type AuthError,
  AuthErrorCodes,
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";
import { useState } from "react";

import { useMutation } from "@tanstack/react-query";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Lock, Mail } from "lucide-react";
import { type SubmitHandler, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import { firebaseAuth } from "../firebase/client";
import { Button } from "@wadzzo/ui/components/button";
import { Input } from "@wadzzo/ui/components/input";
const formSchema = z
  .object({
    email: z.email("Please enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FormInputs = z.infer<typeof formSchema>;

interface EmailSignUpFormProps {
  onSuccess?: () => void;
}

export function EmailSignUpForm({ onSuccess }: EmailSignUpFormProps) {
  const [emailSent, setEmailSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormInputs>({
    resolver: zodResolver(formSchema),
  });

  const registerMutation = useMutation({
    mutationFn: async (data: FormInputs) => {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, data.email, data.password);
      const user = cred.user;
      if (!user.emailVerified) {
        await sendEmailVerification(user);
      }
      return user;
    },
    onSuccess: () => {
      toast.success("Account created! Please check your email to verify.");
      setEmailSent(true);
      reset();
      // Optionally navigate back to login after successful signup
      setTimeout(() => {
        onSuccess?.();
      }, 2000);
    },
    onError: (error: AuthError) => {
      if (error.code === AuthErrorCodes.EMAIL_EXISTS) {
        toast.error("An account with this email already exists");
      } else {
        toast.error(error.message);
      }
    },
  });

  const onSubmit: SubmitHandler<FormInputs> = (data) => {
    registerMutation.mutate(data);
  };

  return (
    <form className="flex w-full flex-col gap-3" onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-1">
        <div className="relative">
          <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            type="email"
            disabled={registerMutation.isPending}
            required
            {...register("email")}
            placeholder="Email address"
            className="pl-9"
          />
        </div>
        {errors.email && <p className="text-destructive text-xs">{errors.email.message}</p>}
      </div>

      <div className="space-y-1">
        <div className="relative">
          <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            type="password"
            disabled={registerMutation.isPending}
            required
            {...register("password")}
            placeholder="Password"
            className="pl-9"
          />
        </div>
        {errors.password && <p className="text-destructive text-xs">{errors.password.message}</p>}
      </div>

      <div className="space-y-1">
        <div className="relative">
          <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            type="password"
            disabled={registerMutation.isPending}
            required
            {...register("confirmPassword")}
            placeholder="Confirm password"
            className="pl-9"
          />
        </div>
        {errors.confirmPassword && (
          <p className="text-destructive text-xs">{errors.confirmPassword.message}</p>
        )}
      </div>

      {emailSent && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-300">
          Verification email sent! Check your inbox.
        </p>
      )}

      <Button
        disabled={registerMutation.isPending}
        type="submit"
        className="w-full rounded-xl py-2.5"
      >
        {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create Account
      </Button>
    </form>
  );
}
