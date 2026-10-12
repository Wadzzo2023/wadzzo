"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { SignedIn } from "~/components/shell/sign-in-prompt";
import { UserPlus } from "lucide-react";
import { platformBranding } from "@wadzzo/platform/branding";

/** Old /signup links: show the sign-in prompt, then go home once signed in. */
export function SignupView() {
  return (
    <SignedIn
      icon={UserPlus}
      title={`Join ${platformBranding.name}`}
      description="Sign up with email, Google, Facebook or Apple — or connect your own Stellar wallet."
    >
      <GoHome />
    </SignedIn>
  );
}

function GoHome() {
  const router = useRouter();
  useEffect(() => router.replace("/"), [router]);
  return null;
}
