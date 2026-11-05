"use client";

import dynamic from "next/dynamic";

import { useWalletConnectModalStore } from "../state/wallet-connect-modal-store";
import { ConnectWalletDialog } from "./connect-wallet-dialog";

const Toaster = dynamic(() => import("react-hot-toast").then((mod) => mod.Toaster));

/**
 * Mount once near the app root: the toast container, the connect-wallet dialog
 * and the element WalletConnect's modal renders into.
 */
export function ConnectWalletPopups({
  className,
  requireEmailVerification = true,
}: {
  className: string;
  /** See `ConnectWalletDialog`. */
  requireEmailVerification?: boolean;
}) {
  const isWalletConnectOpen = useWalletConnectModalStore((state) => state.isOpen);

  return (
    <>
      <Toaster
        containerClassName={className}
        toastOptions={{
          className: "!rounded-xl !border !border-border !bg-card !text-card-foreground !shadow-lg",
        }}
      />
      <ConnectWalletDialog requireEmailVerification={requireEmailVerification} />
      {isWalletConnectOpen ? <w3m-modal /> : null}
    </>
  );
}
