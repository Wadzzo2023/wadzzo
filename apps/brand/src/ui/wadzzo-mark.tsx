import { platformBranding } from "@wadzzo/platform/branding";
import { TokenMark } from "@wadzzo/ui/poster/token-mark";

/** The platform's mark in the current text colour (prices, balances, the logo tile). */
export function WadzzoMark({ className }: { className?: string }) {
  return <TokenMark src={platformBranding.assets.loading} className={className} />;
}
