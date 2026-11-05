"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { DocumentDuplicateIcon, SignalSlashIcon } from "@heroicons/react/24/solid";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpCircle,
  CheckCircle2,
  LogOut,
  QrCodeIcon,
  RefreshCcw,
  Wallet,
  X,
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
import { abbreviateAddress } from "@wadzzo/utils/address";
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
import Image, { type StaticImageData } from "next/image";

import albedoLogo from "./assets/albedo.svg";
import freighterLogo from "./assets/freighter.png";
import rabetLogo from "./assets/rabet.png";
import xbullLogo from "./assets/xbull-dark.svg";

type AuthView = "login" | "signup" | "forgot-password";

/**
 * The dialog's close button: a solid dark disc with a white X, so it reads over the plain card and
 * over the signed-in profile's cover photo alike, and `z-20` so scrolling content never covers it.
 */
const CLOSE_BUTTON_CLASS =
  "z-20 bg-black/55 text-white opacity-100 hover:bg-black/75 data-[state=open]:bg-black/55 data-[state=open]:text-white";
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
  image,
  icon,
}: {
  label: string;
  onClick: () => void;
  selected: boolean;
  tooltip?: string;
  image?: string | StaticImageData;
  icon?: React.ReactNode;
}) {
  return (
    <div data-tip={tooltip} className={tooltip ? "tooltip w-full" : "w-full"}>
      <button
        onClick={onClick}
        className={clsx(
          "flex w-full items-center gap-2.5 rounded-xl border-2 px-3 py-2 text-sm font-bold transition-[transform,border-color] duration-150",
          "hover:border-foreground hover:-translate-y-0.5",
          selected
            ? "border-primary bg-primary/10 text-primary"
            : "border-foreground/12 bg-card text-card-foreground",
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
          {image ? (
            <Image
              src={image}
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
  Record<WalletType, { image?: string | StaticImageData; icon?: React.ReactNode }>
> = {
  [WalletType.freighter]: { image: freighterLogo },
  [WalletType.rabet]: { image: rabetLogo },
  [WalletType.albedo]: { image: albedoLogo },
  [WalletType.xBull]: { image: xbullLogo },
  [WalletType.hana]: { icon: <HanaIcon /> },
  [WalletType.metamask]: { icon: <MetaMaskIcon /> },
  [WalletType.hotWallet]: { image: "https://storage.herewallet.app/logo.png" },
};

// ─── Main component ───────────────────────────────────────────────────────────
export function ConnectWalletDialog() {
  const [authView, setAuthView] = useState<AuthView>("login");
  const [activeTab, setActiveTab] = useState<"action" | "stellar">("action");
  const [isAccountActivate, setAccountActivate] = useState(false);
  const [isAccountActivateLoading, setAccountActivateLoading] = useState(false);
  /** The account `isAccountActivate` was last worked out for, so a stale answer for another user is ignored. */
  const [activityCheckedFor, setActivityCheckedFor] = useState<string | null>(null);
  const dialogModalState = useConnectWalletDialogStore();
  const [selectedWallet, setSelectedWallet] = useState(WalletType.none);
  const isIosFBuser = useFacebookIosUserAgent();
  const session = useSession();

  // True only inside the AR app's phone-shaped device frame (see the note on
  // AR_APP_FRAME_SELECTOR). Everywhere else `isFramedHost` stays false and the
  // dialog keeps its wide two-column layout below.
  const [frameContainer, setFrameContainer] = useState<HTMLElement | null>(null);
  const isFramedHost = frameContainer !== null;
  useEffect(() => {
    setFrameContainer(document.querySelector<HTMLElement>(AR_APP_FRAME_SELECTOR));
  }, []);

  const checkAccountActivity = useCallback(async (publicKey: string) => {
    setAccountActivateLoading(true);
    const isActive = await isStellarAccountActive(publicKey);
    setAccountActivate(isActive);
    setActivityCheckedFor(publicKey);
    setAccountActivateLoading(false);
  }, []);

  const checkStatus = useCallback(async () => {
    const user = session.data?.user;
    if (user) await checkAccountActivity(user.id);
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
      useConnectWalletDialogStore.getState().setNotice(null);
    }
  }, [dialogModalState.isOpen]);

  // A failed attempt's message belongs to the form it came from: drop it when the user moves to
  // another tab or view. (A success note, e.g. "check your email", outlives the switch back to login.)
  useEffect(() => {
    const { notice, setNotice } = useConnectWalletDialogStore.getState();
    if (notice?.type === "error") setNotice(null);
  }, [activeTab, authView]);

  // The message is the answer to what they just did, so make sure it is on screen even when the
  // form has been scrolled (a phone shows only part of this dialog at a time).
  const noticeRef = useRef<HTMLDivElement>(null);
  const notice = dialogModalState.notice;
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [notice]);

  const authUser =
    session.status === "authenticated" && !!session.data?.user.emailVerified && isAccountActivate;

  // Close by itself once someone signs in. The dialog also opens for a signed-in user (account
  // menu: "Switch account"), so being signed in is not the signal: a *different* user than the
  // one who was signed in when it opened is. A login that still needs something from the user
  // (verify the email, fund the account) keeps it open, since the dialog is where that is shown.
  const signedInUserId =
    session.status === "authenticated" ? (session.data?.user.id ?? null) : null;
  const openedAsRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!dialogModalState.isOpen) {
      openedAsRef.current = undefined;
      return;
    }
    if (session.status === "loading") return;
    if (openedAsRef.current === undefined) {
      openedAsRef.current = signedInUserId;
      return;
    }
    const justSignedIn =
      signedInUserId !== null &&
      signedInUserId !== openedAsRef.current &&
      authUser &&
      !isAccountActivateLoading &&
      activityCheckedFor === signedInUserId;
    if (justSignedIn) dialogModalState.setIsOpen(false);
  }, [
    dialogModalState,
    session.status,
    signedInUserId,
    authUser,
    isAccountActivateLoading,
    activityCheckedFor,
  ]);

  const title = authUser
    ? "Switch account"
    : activeTab === "stellar"
      ? "Connect Wallet"
      : "Welcome back";
  const subtitle = authUser
    ? activeTab === "stellar"
      ? "Use another Stellar wallet"
      : "Use another email, Google or Apple account"
    : activeTab === "stellar"
      ? "Choose your Stellar wallet to sign in"
      : "Sign in to access your account";

  // ── Profile card ──
  // Who is signed in: a brand-colour cover with the avatar breaking out of it, the name, how they
  // signed in and their wallet address, plus copy and sign-out. The login tabs below it switch
  // to another account.
  function ProfileCard() {
    if (session.status !== "authenticated" || !session.data) return null;
    const user = session.data.user;
    const profile = dialogModalState.profile;
    const name = profile?.name ?? (user as { name?: string }).name ?? abbreviateAddress(user.id, 8);
    const image = profile?.image ?? (user as { image?: string | null }).image;
    const cover = profile?.coverImage;
    const initials = name.slice(0, 2).toUpperCase();
    const walletLabel = getWalletLabel(user.walletType ?? "");
    return (
      <div
        className={clsx(
          // full width of the column and flush with the dialog's top: cancel the panel's padding
          "border-foreground/10 bg-card shrink-0 overflow-hidden border-b-2",
          isFramedHost ? "-mx-4 -mt-10" : "-mx-6 -mt-6 lg:-mx-8 lg:-mt-5",
        )}
      >
        <div className="side-scope relative h-[4.5rem] bg-[hsl(var(--side-bg,var(--primary)))]">
          {cover ? (
            <>
              <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/10"
              />
            </>
          ) : (
            // no cover photo: a quiet dashed pattern on the brand colour
            <div
              aria-hidden
              className="absolute inset-0 opacity-15"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, currentColor 0 2px, transparent 2px 14px)",
                color: "hsl(var(--side-ink, var(--primary-foreground)))",
              }}
            />
          )}
          {/* how they signed in, as a badge on the cover */}
          <span className="label-caps absolute top-3 left-4 rounded-full bg-black/55 px-2.5 py-1 text-[10px] text-white">
            {walletLabel}
          </span>
        </div>
        <div
          className={clsx("flex items-center gap-3 pb-3.5", isFramedHost ? "px-4" : "px-6 lg:px-8")}
        >
          <div className="border-card bg-primary text-primary-foreground relative z-10 -mt-7 flex size-16 shrink-0 items-center justify-center self-start overflow-hidden rounded-full border-4 text-lg font-bold">
            {image ? <img src={image} alt="" className="size-full object-cover" /> : initials}
          </div>
          <div className="min-w-0 flex-1 pt-1.5">
            <div className="flex items-center gap-1.5">
              <p className="display text-foreground truncate text-2xl">{name}</p>
              <CheckCircle2 className="text-primary size-4 shrink-0" />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground font-mono">
                {abbreviateAddress(user.id, 6)}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5 pt-1.5">
            <button
              onClick={() => {
                void toast.promise(navigator.clipboard.writeText(user.id), {
                  loading: "Copying…",
                  success: "Address copied",
                  error: "Failed to copy",
                });
              }}
              title="Copy wallet address"
              aria-label="Copy wallet address"
              className="border-foreground/12 hover:border-foreground flex size-9 items-center justify-center rounded-xl border-2 transition-colors"
            >
              <DocumentDuplicateIcon className="size-4" />
            </button>
            <button
              onClick={disconnectWallet}
              title="Sign out"
              aria-label="Sign out"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 flex size-9 items-center justify-center rounded-xl border-2 transition-colors"
            >
              <LogOut className="size-4" />
            </button>
          </div>
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
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
        <button
          onClick={() => void appleProvider.login()}
          className="border-foreground/12 bg-card text-card-foreground hover:border-foreground flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 px-4 text-sm font-bold whitespace-nowrap transition-[transform,border-color] duration-150 hover:-translate-y-0.5 disabled:opacity-50"
        >
          <svg className="size-[18px]" viewBox="0 0 384 512" fill="currentColor" aria-hidden>
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
          </svg>
          Apple
        </button>

        <span className="marker text-muted-foreground text-xs">or</span>

        <button
          onClick={() => void googleProvider.login()}
          disabled={isIosFBuser ?? false}
          className="border-foreground/12 bg-card text-card-foreground hover:border-foreground flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 px-4 text-sm font-bold whitespace-nowrap transition-[transform,border-color] duration-150 hover:-translate-y-0.5 disabled:opacity-50"
        >
          <svg className="size-[18px]" viewBox="0 0 48 48" aria-hidden>
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
            />
          </svg>
          Google
        </button>
      </div>
    );
  }

  // ── Action tab content ──
  // Called as a function, not rendered as `<ActionTabContent />`: a component defined inside this
  // one is a new type on every render, so React would remount the form (and wipe what the user
  // typed) whenever anything in the dialog changes, e.g. an error message appearing.
  function ActionTabContent() {
    return (
      <div className="flex flex-col gap-4">
        {authView === "login" && (
          <>
            <EmailLoginForm onForgotPassword={() => setAuthView("forgot-password")} />

            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <span className="border-foreground/15 w-full border-t-2 border-dashed" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background marker text-muted-foreground px-2">
                  or continue with
                </span>
              </div>
            </div>

            <SocialButtons />

            {/* already signed in: switching accounts doesn't need the sign-up prompt */}
            {!authUser && (
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
            )}
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
        <DialogContent
          portalContainer={frameContainer}
          closeClassName={CLOSE_BUTTON_CLASS}
          className="max-w-sm rounded-2xl p-6"
        >
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
           width for the AR app's device frame — Tailwind's `lg:` variants key
           off the real browser viewport, not that frame's width, so left
           alone the two-column grid would still activate on any wide screen
           and cram a 280px side panel into a ~400px box. */
        <DialogContent
          portalContainer={frameContainer}
          closeClassName={CLOSE_BUTTON_CLASS}
          className={
            isFramedHost
              ? clsx(
                  "mx-auto flex w-full max-w-[420px] flex-col gap-0 overflow-hidden p-0",
                  authUser ? "h-[85vh]" : "h-[80vh]",
                )
              : clsx(
                  // as tall as its content (no inner scroll), never shorter than the email view so switching tabs
                  // doesn't resize it; the 92dvh cap only matters on very short screens
                  "border-foreground/15 flex max-w-[820px] gap-0 overflow-hidden rounded-[1.6rem] border-2 p-0 shadow-[10px_11px_0_0_hsl(var(--primary))] lg:grid lg:min-h-[min(624px,92dvh)] lg:grid-cols-[1fr_290px] lg:grid-rows-[minmax(0,1fr)]",
                )
          }
        >
          {/* ── Left panel ── */}
          <div
            className={clsx(
              "flex min-h-0 w-full flex-1 flex-col overflow-y-auto",
              isFramedHost
                ? "gap-4 px-4 pt-10 pb-4"
                : authUser
                  ? "gap-3 p-6 lg:px-8 lg:py-5"
                  : "gap-4 p-6 lg:px-8 lg:py-7",
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
            {authUser && ProfileCard()}

            {/* Header */}
            <div className={isFramedHost ? "pr-9" : "pr-9 lg:pr-0"}>
              <DialogTitle
                className={clsx("display text-foreground", authUser ? "text-3xl" : "text-[2.6rem]")}
              >
                {title}
              </DialogTitle>
              <p className="marker text-primary mt-2 -rotate-1 text-sm">{subtitle}</p>
            </div>

            {/* What happened to the last attempt (wrong password, check your email…) */}
            {notice && (
              <div
                ref={noticeRef}
                role={notice.type === "error" ? "alert" : "status"}
                className={clsx(
                  "flex items-start gap-2.5 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold",
                  notice.type === "error"
                    ? "border-destructive bg-destructive text-destructive-foreground"
                    : "border-primary bg-primary text-primary-foreground",
                )}
              >
                {notice.type === "error" ? (
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                )}
                <p className="min-w-0 flex-1 break-words">{notice.text}</p>
                <button
                  type="button"
                  onClick={() => dialogModalState.setNotice(null)}
                  aria-label="Dismiss message"
                  className="-m-1 shrink-0 rounded-full p-1 opacity-80 hover:opacity-100"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}

            {/* Tabs — controlled so switching is stable */}
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "action" | "stellar")}
              className="w-full"
            >
              <TabsList className="bg-surface-2 grid h-12 w-full grid-cols-2 rounded-2xl p-1">
                <TabsTrigger
                  value="action"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground font-hud rounded-xl text-sm tracking-wide uppercase data-[state=active]:shadow-none dark:data-[state=active]:border-transparent"
                >
                  Action Login
                </TabsTrigger>
                <TabsTrigger
                  value="stellar"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground font-hud rounded-xl text-sm tracking-wide uppercase data-[state=active]:shadow-none dark:data-[state=active]:border-transparent"
                >
                  Stellar Login
                </TabsTrigger>
              </TabsList>
              <TabsContent value="action" className={authUser ? "mt-2" : "mt-4"}>
                {ActionTabContent()}
              </TabsContent>
              <TabsContent value="stellar" className={authUser ? "mt-2" : "mt-4"}>
                {StellarTabContent()}
              </TabsContent>
            </Tabs>
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
                : "bg-primary/10 dark:bg-primary/15 text-foreground border-foreground/10 relative hidden flex-col overflow-hidden border-l-2 lg:flex"
            }
          >
            <div className="p-6 pb-3">
              <p className="marker text-primary text-sm">*scan to connect*</p>
              <h3 className="display mt-2 text-4xl">Action Auth System</h3>
            </div>

            <div className="flex flex-1 items-center justify-center px-6">
              <div className="bg-card border-foreground/10 relative flex h-44 w-full -rotate-2 items-center justify-center overflow-hidden rounded-2xl border-2">
                {/* QR blurred watermark */}
                <QrCodeIcon className="text-foreground absolute h-36 w-36 scale-110 opacity-10" />
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
                className="bg-card border-foreground/10 hover:border-foreground flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors"
              >
                <Image
                  src="/images/icons/labstr.png"
                  alt="Lobstr"
                  width={32}
                  height={32}
                  className="shrink-0 rounded-full"
                />
                <div>
                  <p className="marker text-muted-foreground text-[11px]">works with</p>
                  <p className="display text-xl">Lobstr Mobile App</p>
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
          "flex w-full items-center gap-2.5 rounded-xl border-2 text-sm font-bold transition-[transform,border-color,background-color] duration-150 disabled:opacity-60",
          inGrid ? "px-3 py-2" : "justify-center px-4 py-2.5",
          isSelected
            ? "border-primary bg-primary/10 ring-primary/30 text-primary hover:bg-primary/20 ring-1"
            : onDark
              ? "border-primary bg-primary text-primary-foreground hover:-translate-y-0.5"
              : "border-foreground/12 bg-card text-card-foreground hover:border-foreground hover:-translate-y-0.5",
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
