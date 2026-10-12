"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { DocumentDuplicateIcon, SignalSlashIcon } from "@heroicons/react/24/solid";
import {
  ArrowLeft,
  ArrowUpCircle,
  CheckCircle2,
  LogOut,
  QrCodeIcon,
  RefreshCcw,
  Wallet,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import clsx from "clsx";

import { appleProvider, googleProvider } from "../providers/custodial/social-sign-in";
import {
  configureWalletConnectClient,
  walletConnectProvider,
} from "../providers/extension/wallet-connect";
import { useConnectWalletDialogStore } from "../state/connect-dialog-store";
import { useWalletConnectModalStore } from "../state/wallet-connect-modal-store";
import { isStellarAccountActive } from "../stellar/horizon";
import { abbreviateAddress } from "@wadzzo/utils/utils";
import { ForgotPasswordForm } from "./forgot-password-form";
import { EmailLoginForm } from "./email-login-form";
import { EmailSignUpForm } from "./email-sign-up-form";
import { AR_APP_FRAME_SELECTOR } from "./host-frame";
import { Button } from "@wadzzo/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@wadzzo/ui/components/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wadzzo/ui/components/tabs";
import { useFacebookIosUserAgent } from "./use-facebook-ios-user-agent";
import { HanaIcon, MetaMaskIcon } from "./wallet-icons";
import { NON_CUSTODIAL_PROVIDERS } from "../providers/registry";
import { WalletType } from "../wallet-type";
import Image from "next/image";

type AuthView = "login" | "signup" | "forgot-password";
interface ConnectWalletDialogProps {
  className: string;
}

function getWalletLabel(walletType: WalletType): string {
  switch (walletType) {
    case WalletType.freighter:
      return "Stellar · Freighter Wallet";
    case WalletType.rabet:
      return "Stellar · Rabet Wallet";
    case WalletType.albedo:
      return "Stellar · Albedo Wallet";
    case WalletType.xBull:
      return "Stellar · xBull Wallet";
    case WalletType.hana:
      return "Stellar · Hana Wallet";
    case WalletType.hotWallet:
      return "Stellar · HOT Wallet";
    case WalletType.metamask:
      return "Stellar · MetaMask Wallet";
    case WalletType.walletConnect:
      return "Stellar · Lobstr Wallet";
    case WalletType.google:
      return "Action Account · Google";
    case WalletType.apple:
      return "Action Account · Apple";
    default:
      return "Action Account";
  }
}

// ─── Wallet button ────────────────────────────────────────────────────────────
function WalletButton({
  label,
  onClick,
  selected,
  tooltip,
  imageUrl,
  icon,
}: {
  label: string;
  onClick: () => void;
  selected: boolean;
  tooltip?: string;
  imageUrl?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div data-tip={tooltip} className={tooltip ? "tooltip w-full" : "w-full"}>
      <button
        onClick={onClick}
        className={clsx(
          "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-sm font-medium transition-all duration-150",
          "hover:border-primary/50 hover:bg-muted",
          selected
            ? "border-primary bg-primary/10 ring-primary/30 text-primary ring-1"
            : "border-border bg-card text-card-foreground",
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={label}
              width={28}
              height={28}
              className="rounded-full object-contain"
            />
          ) : (
            icon
          )}
        </span>
        <span className="flex-1 text-left">{label}</span>
        {selected && <CheckCircle2 className="text-primary h-4 w-4 shrink-0" />}
      </button>
    </div>
  );
}

/** Logo (hosted image or inline icon) shown on each wallet's connect button. */
const WALLET_BUTTON_ART: Partial<
  Record<WalletType, { imageUrl?: string; icon?: React.ReactNode }>
> = {
  [WalletType.freighter]: { imageUrl: "/images/wallets/freighter.png" },
  [WalletType.rabet]: { imageUrl: "/images/wallets/rabet.png" },
  [WalletType.albedo]: { imageUrl: "/images/wallets/albedo.svg" },
  [WalletType.xBull]: { imageUrl: "/images/wallets/xbull-dark.svg" },
  [WalletType.hana]: { icon: <HanaIcon /> },
  [WalletType.metamask]: { icon: <MetaMaskIcon /> },
  [WalletType.hotWallet]: { imageUrl: "https://storage.herewallet.app/logo.png" },
};

// ─── Main component ───────────────────────────────────────────────────────────
export function ConnectWalletDialog({ className }: ConnectWalletDialogProps) {
  const [authView, setAuthView] = useState<AuthView>("login");
  const [activeTab, setActiveTab] = useState<"action" | "stellar">("action");
  const [isAccountActivate, setAccountActivate] = useState(false);
  const [isAccountActivateLoading, setAccountActivateLoading] = useState(false);
  const dialogModalState = useConnectWalletDialogStore();
  const [selectedWallet, setSelectedWallet] = useState(WalletType.none);
  const isIosFBuser = useFacebookIosUserAgent();
  const session = useSession();
  const [loading, setLoading] = useState(false);

  // True only inside wadzzoAR's phone-shaped device frame (see the note on
  // AR_APP_FRAME_SELECTOR) — everywhere else this package is used, including
  // any other project sharing this same submodule, `isFramedHost` stays
  // false and the dialog keeps its original wide two-column layout below.
  const [frameContainer, setFrameContainer] = useState<HTMLElement | null>(null);
  const isFramedHost = frameContainer !== null;
  useEffect(() => {
    setFrameContainer(document.querySelector<HTMLElement>(AR_APP_FRAME_SELECTOR));
  }, []);

  const checkAccountActivity = useCallback(async (publicKey: string) => {
    setAccountActivateLoading(true);
    const isActive = await isStellarAccountActive(publicKey);
    setAccountActivate(isActive);
    setAccountActivateLoading(false);
  }, []);

  const checkStatus = useCallback(async () => {
    const user = session.data?.user;
    if (user) {
      setLoading(true);
      await checkAccountActivity(user.id);
      setLoading(false);
    }
  }, [checkAccountActivity, session.data?.user]);

  // Plain browser navigation, not next/router or next/navigation: this
  // package is shared by Pages-Router and App-Router apps.
  const disconnectWallet = useCallback(async () => {
    await signOut({ redirect: false });
    window.location.reload();
  }, []);

  function toolTipsAddr(walletType: WalletType) {
    const user = session.data?.user;
    if (user && selectedWallet === walletType) return abbreviateAddress(user.id, 10);
  }

  useEffect(() => {
    void checkStatus();
    const w = session.data?.user.walletType;
    setSelectedWallet(w ?? WalletType.none);
  }, [checkStatus, session.data?.user.walletType]);

  const handleClose = () => {
    dialogModalState.setIsOpen(false);
  };

  useEffect(() => {
    if (dialogModalState.isOpen) {
      setAuthView("login");
      setActiveTab("action");
    }
  }, [dialogModalState.isOpen]);

  const authUser =
    session.status === "authenticated" && !!session.data?.user.emailVerified && isAccountActivate;

  const title = activeTab === "stellar" ? "Connect Wallet" : "Welcome back";
  const subtitle =
    activeTab === "stellar"
      ? authUser
        ? "Your Stellar wallet is connected"
        : "Choose your Stellar wallet to sign in"
      : "Sign in to access your account";

  // ── Profile card ──
  function ProfileCard() {
    if (session.status !== "authenticated" || !session.data) return null;
    const user = session.data.user;
    const name = (user as { name?: string }).name ?? abbreviateAddress(user.id, 8);
    const initials = name.slice(0, 2).toUpperCase();
    const walletLabel = getWalletLabel(user.walletType ?? "");
    return (
      <div className="bg-muted/40 flex items-center gap-2 rounded-xl border px-3 py-2">
        <div className="bg-primary text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="text-foreground truncate text-xs font-semibold sm:text-sm">{name}</p>
            <CheckCircle2 className="text-primary h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
          </div>
          <p className="text-muted-foreground truncate text-[10px] sm:text-xs">{walletLabel}</p>
        </div>
        <div className="divide-border flex shrink-0 items-center divide-x overflow-hidden rounded-lg border">
          <button
            onClick={() => {
              void toast.promise(navigator.clipboard.writeText(user.id), {
                loading: "Copying…",
                success: "Copied!",
                error: "Failed to copy",
              });
            }}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 px-2 py-1.5 text-xs font-medium transition-colors sm:gap-1.5 sm:px-2.5"
          >
            <DocumentDuplicateIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Copy</span>
          </button>
          <button
            onClick={disconnectWallet}
            className="text-destructive hover:bg-destructive/10 flex items-center gap-1 px-2 py-1.5 text-xs font-medium transition-colors sm:gap-1.5 sm:px-2.5"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Disconnect</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Disconnect button ──
  function DisconnectButton() {
    if (session.status !== "authenticated") return null;
    return (
      <Button
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full rounded-xl py-2.5"
        onClick={disconnectWallet}
      >
        <SignalSlashIcon className="mr-2 h-4 w-4" />
        Disconnect Wallet
      </Button>
    );
  }

  // ── Not activated state ──
  function NotActivatedUser() {
    if (isAccountActivateLoading) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <ArrowUpCircle className="text-muted-foreground h-8 w-8 animate-spin" />
          <p className="text-muted-foreground text-sm font-medium">Checking account status…</p>
        </div>
      );
    }
    if (session.data && !isAccountActivate) {
      return (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full">
            <Wallet className="text-muted-foreground h-7 w-7" />
          </div>
          <div>
            <p className="text-base font-semibold">Account not activated</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Fund your Stellar account to activate it, then refresh.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const id = session.data.user.id;
                void navigator.clipboard
                  .writeText(id)
                  .then(() => toast.success("Copied: " + abbreviateAddress(id)));
              }}
            >
              <DocumentDuplicateIcon className="mr-1.5 h-3.5 w-3.5" />
              Copy address
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isAccountActivateLoading}
              onClick={() => void checkStatus()}
            >
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>
      );
    }
    return null;
  }

  // ── Social auth buttons ──
  function SocialButtons() {
    return (
      <div className="flex flex-col gap-2.5">
        <button
          onClick={() => void appleProvider.login()}
          className="bg-foreground text-background hover:bg-foreground/90 flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium transition"
        >
          <svg className="h-4 w-4" viewBox="0 0 384 512" fill="currentColor">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
          </svg>
          Continue with Apple
        </button>

        <button
          onClick={() => void googleProvider.login()}
          disabled={isIosFBuser ?? false}
          className="bg-background text-foreground hover:bg-muted flex w-full items-center justify-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 18 19" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.842 18.083a8.8 8.8 0 0 1-8.65-8.948 8.841 8.841 0 0 1 8.8-8.652h.153a8.464 8.464 0 0 1 5.7 2.257l-2.193 2.038A5.27 5.27 0 0 0 9.09 3.4a5.882 5.882 0 0 0-.2 11.76h.124a5.091 5.091 0 0 0 5.248-4.057L14.3 11H9V8h8.34c.066.543.095 1.09.088 1.636-.086 5.053-3.463 8.449-8.4 8.449l-.186-.002Z"
              clipRule="evenodd"
            />
          </svg>
          Continue with Google
        </button>
      </div>
    );
  }

  // ── Action tab content ──
  function ActionTabContent() {
    return (
      <div className="flex flex-col gap-4">
        {authView === "login" && (
          <>
            <EmailLoginForm onForgotPassword={() => setAuthView("forgot-password")} />

            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background text-muted-foreground px-2">or continue with</span>
              </div>
            </div>

            <SocialButtons />

            <p className="text-muted-foreground text-center text-sm">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => setAuthView("signup")}
                className="text-primary font-semibold hover:underline"
              >
                Sign up
              </button>
            </p>
          </>
        )}

        {authView === "signup" && (
          <>
            <button
              type="button"
              onClick={() => setAuthView("login")}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to login
            </button>
            <EmailSignUpForm onSuccess={() => setAuthView("login")} />
          </>
        )}

        {authView === "forgot-password" && (
          <>
            <button
              type="button"
              onClick={() => setAuthView("login")}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to login
            </button>
            <ForgotPasswordForm />
          </>
        )}
      </div>
    );
  }

  // ── Stellar wallets grid ──
  function StellarTabContent() {
    return (
      <div className="flex flex-col gap-2">
        {authUser && <p className="text-muted-foreground text-xs font-medium">Switch wallet</p>}

        <div className="grid grid-cols-2 gap-2">
          {NON_CUSTODIAL_PROVIDERS.map((provider) => (
            <WalletButton
              key={provider.type}
              label={provider.label}
              onClick={() => void provider.login()}
              selected={selectedWallet === provider.type}
              tooltip={toolTipsAddr(provider.type)}
              {...WALLET_BUTTON_ART[provider.type]}
            />
          ))}
          {/* Complementary with the right panel's own Lobstr button, not
              redundant with it: this tile is the ONLY way to reach
              Lobstr/WalletConnect once that panel is narrow (`lg:hidden`,
              real viewport) or hidden outright for the framed host, which
              has no viewport width at which the panel ever reappears. Without
              the `isFramedHost` half of this condition, a framed host
              reviewed at normal desktop width — which is how this app is
              meant to be looked at — would show Lobstr in neither place. */}
          <div className={isFramedHost ? undefined : "lg:hidden"}>
            <WCButton
              toolTipsAddr={toolTipsAddr}
              selectedWallet={selectedWallet}
              text="Lobstr"
              inGrid
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={dialogModalState.isOpen} onOpenChange={handleClose}>
      {/* Not-activated state — compact dialog */}
      {session.status === "authenticated" &&
      session.data?.user.emailVerified &&
      !isAccountActivateLoading &&
      !isAccountActivate ? (
        <DialogContent portalContainer={frameContainer} className="max-w-sm rounded-2xl p-6">
          <DialogTitle className="sr-only">Account Status</DialogTitle>
          <NotActivatedUser />
          <div className="mt-4">
            <DisconnectButton />
          </div>
        </DialogContent>
      ) : (
        /* Main dialog — inlined to prevent remounting.
           Two layouts, chosen by `isFramedHost`: the original wide
           two-column grid (unchanged, for every other consumer of this
           shared package), or a single column capped to a phone-comfortable
           width for wadzzoAR's device frame — Tailwind's `lg:` variants key
           off the real browser viewport, not that frame's width, so left
           alone the two-column grid would still activate on any wide screen
           and cram a 280px side panel into a ~400px box. */
        <DialogContent
          portalContainer={frameContainer}
          className={
            isFramedHost
              ? clsx(
                  "mx-auto flex w-full max-w-[420px] flex-col gap-0 overflow-hidden p-0",
                  authUser ? "h-[85vh]" : "h-[80vh]",
                )
              : clsx(
                  "flex max-w-[800px] gap-0 overflow-hidden p-0 lg:grid lg:grid-cols-[1fr_280px]",
                  authUser ? "h-[85vh]" : "h-[80vh]",
                )
          }
        >
          {/* ── Left panel ── */}
          <div
            className={clsx(
              "flex min-h-0 w-full flex-1 flex-col overflow-y-auto",
              authUser ? "gap-3 px-4 pt-10 pb-4 sm:p-4 lg:p-5" : "gap-5 p-6 lg:p-8",
            )}
          >
            {/* Unverified email banner */}
            {session.data?.user && !session.data.user.emailVerified && (
              <div className="bg-secondary/60 rounded-xl border p-4">
                <p className="text-foreground text-sm font-semibold">{session.data.user.email}</p>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  Please verify your email before continuing.
                </p>
                <Button size="sm" variant="outline" className="mt-3" onClick={disconnectWallet}>
                  <SignalSlashIcon className="mr-1.5 h-3.5 w-3.5" />
                  Logout
                </Button>
              </div>
            )}

            {/* Profile card */}
            {authUser && <ProfileCard />}

            {/* Header */}
            <div>
              <DialogTitle
                className={clsx(
                  "text-foreground font-bold tracking-tight",
                  authUser ? "text-base" : "text-xl",
                )}
              >
                {title}
              </DialogTitle>
              <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
            </div>

            {/* Tabs — controlled so switching is stable */}
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "action" | "stellar")}
              className="w-full"
            >
              <TabsList className="bg-muted grid w-full grid-cols-2 rounded-xl p-1">
                <TabsTrigger
                  value="action"
                  className="data-[state=active]:bg-foreground data-[state=active]:text-background rounded-lg text-sm font-medium"
                >
                  Action Login
                </TabsTrigger>
                <TabsTrigger
                  value="stellar"
                  className="data-[state=active]:bg-foreground data-[state=active]:text-background rounded-lg text-sm font-medium"
                >
                  Stellar Login
                </TabsTrigger>
              </TabsList>
              <TabsContent value="action" className={authUser ? "mt-2" : "mt-4"}>
                <ActionTabContent />
              </TabsContent>
              <TabsContent value="stellar" className={authUser ? "mt-2" : "mt-4"}>
                <StellarTabContent />
              </TabsContent>
            </Tabs>

            {/* Disconnect */}
            {authUser && (
              <div className="mt-auto flex flex-col gap-2">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background text-muted-foreground px-2">or</span>
                  </div>
                </div>
                <DisconnectButton />
              </div>
            )}
          </div>

          {/* ── Right panel ──
              Desktop-only marketing panel (QR code, "scan to connect") from
              the original wide two-column layout. Hidden outright in the
              framed host rather than left on its original `lg:flex` trigger,
              since that keys off the real browser viewport and would still
              fire on any wide screen even though the dialog itself no longer
              renders as a two-column box there. Nothing is lost when it's
              hidden: Lobstr/WalletConnect is still the "Lobstr" tile in the
              Stellar wallet grid below (`WCButton ... inGrid`). Every other
              consumer of this shared package keeps the original panel. */}
          <div
            className={
              isFramedHost
                ? "hidden"
                : "bg-accent relative hidden flex-col overflow-hidden rounded-r-lg lg:flex"
            }
          >
            <div className="p-6 pb-3">
              <p className="text-accent-foreground/60 text-xs font-semibold tracking-widest uppercase">
                Scan to connect
              </p>
              <h3 className="text-accent-foreground mt-1 text-lg font-bold">Action Auth System</h3>
            </div>

            <div className="flex flex-1 items-center justify-center px-6">
              <div className="bg-accent-foreground/10 ring-accent-foreground/20 relative flex h-44 w-full items-center justify-center overflow-hidden rounded-2xl shadow-lg ring-1">
                {/* QR blurred watermark */}
                <QrCodeIcon className="text-accent-foreground/30 absolute h-36 w-36 scale-110 blur-[3px]" />
                {/* Button centred on top */}
                <div className="relative z-10 w-full px-2">
                  <WCButton
                    toolTipsAddr={toolTipsAddr}
                    selectedWallet={selectedWallet}
                    text="Continue with Lobstr"
                    onDark
                  />
                </div>
              </div>
            </div>

            <div className="p-6 pt-3">
              <button
                onClick={() =>
                  (window.location.href =
                    "https://github.com/Lobstrco/lobstr-browser-extension/tree/main")
                }
                className="border-accent-foreground/20 bg-accent-foreground/10 hover:bg-accent-foreground/20 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
              >
                <Image
                  src="/images/icons/labstr.png"
                  alt="Lobstr"
                  width={32}
                  height={32}
                  className="shrink-0 rounded-full"
                />
                <div>
                  <p className="text-accent-foreground/60 text-[10px] tracking-widest uppercase">
                    Works with
                  </p>
                  <p className="text-accent-foreground text-sm font-semibold">Lobstr Mobile App</p>
                </div>
              </button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

// ─── WalletConnect button ─────────────────────────────────────────────────────
function WCButton({
  toolTipsAddr,
  selectedWallet,
  text,
  onDark = false,
  inGrid = false,
}: {
  toolTipsAddr: (walletType: WalletType) => string | undefined;
  selectedWallet: WalletType;
  text?: string;
  onDark?: boolean;
  inGrid?: boolean;
}) {
  const [initializing, setInitializing] = useState(true);
  const [wcLoading, setWcLoading] = useState(false);
  const walletConnectModal = useWalletConnectModalStore();

  async function onInitialize() {
    try {
      await configureWalletConnectClient();
      setInitializing(false);
    } catch (e) {
      console.error(e);
    }
  }

  const isSelected = selectedWallet === WalletType.walletConnect;
  const tooltip = toolTipsAddr(WalletType.walletConnect);

  return (
    <div data-tip={tooltip} className={tooltip ? "tooltip w-full" : "w-full"}>
      <button
        disabled={wcLoading}
        onClick={() => {
          const runner = async () => {
            setWcLoading(true);
            if (initializing) {
              await import("@web3modal/ui");
              await onInitialize();
            }
            setWcLoading(false);
            walletConnectModal.setIsOpen(true);
            await walletConnectProvider.login();
            walletConnectModal.setIsOpen(false);
            toast("WalletConnect session ended");
          };
          void runner();
        }}
        className={clsx(
          "flex w-full items-center gap-2.5 rounded-xl border text-sm font-medium transition-all duration-150 disabled:opacity-60",
          inGrid ? "px-3 py-2" : "justify-center px-4 py-2.5",
          isSelected
            ? "border-primary bg-primary/10 ring-primary/30 text-primary hover:bg-primary/20 ring-1"
            : onDark
              ? "border-accent-foreground/30 bg-accent-foreground/10 text-accent-foreground hover:bg-accent-foreground/20"
              : "border-border bg-card text-card-foreground hover:border-primary/50 hover:bg-muted",
        )}
      >
        <span
          className={clsx("flex shrink-0 items-center justify-center", inGrid ? "h-7 w-7" : "")}
        >
          <Image
            src="/images/icons/labstr.png"
            alt="Lobstr"
            width={inGrid ? 28 : 20}
            height={inGrid ? 28 : 20}
            className="rounded-full object-contain"
          />
        </span>
        {text && (
          <span className="whitespace-nowrap">
            {wcLoading && initializing ? "Initializing…" : text}
          </span>
        )}
        {isSelected && <CheckCircle2 className="text-primary h-4 w-4 shrink-0" />}
      </button>
    </div>
  );
}
