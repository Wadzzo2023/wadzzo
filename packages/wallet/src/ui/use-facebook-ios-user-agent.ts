"use client";

import { useEffect, useState } from "react";

/** True inside Facebook's iOS in-app browser, where Google sign-in is blocked. */
export function useFacebookIosUserAgent(): boolean | null {
  const [isFacebookiOS, setIsFacebookiOS] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const userAgent: string = window.navigator.userAgent;

      // Check if the user agent matches the Facebook app on iOS
      const matchesFacebookiOS: boolean = isFacebookAppiOS(userAgent);

      setIsFacebookiOS(matchesFacebookiOS);
    }
  }, []);

  return isFacebookiOS;
}

function isFacebookAppiOS(userAgent: string): boolean {
  return (
    userAgent.includes("FBIOS") &&
    userAgent.includes("FBAV") &&
    userAgent.includes("iPhone") &&
    userAgent.includes("like Mac OS X")
  );
}
