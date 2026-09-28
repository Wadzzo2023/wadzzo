import { useSession } from "next-auth/react";
import { WalletType } from "package/connect_wallet";
import { type SignUserType } from "~/lib/stellar/custodial-sign";

// Email/Google/Facebook/Apple logins have no on-device keypair — the server
// signs fully on their behalf (see `signNftXdr`/`WithSing`). Real wallet
// sessions return `undefined` so the caller falls back to client-side
// signing via `clientsign`.
export default function useNeedSign() {
  const session = useSession();

  const needSign = (admin?: true): SignUserType => {
    if (admin) return { isAdmin: true };
    const walletType = session.data?.user.walletType;
    const email = session.data?.user.email;
    if (
      email &&
      (walletType === WalletType.emailPass ||
        walletType === WalletType.google ||
        walletType === WalletType.facebook ||
        walletType === WalletType.apple)
    ) {
      return { email };
    }
    return undefined;
  };

  return { needSign };
}
