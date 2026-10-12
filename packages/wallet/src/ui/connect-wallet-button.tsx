"use client";

import Image from "next/image";

import { LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useConnectWalletDialogStore } from "../state/connect-dialog-store";
import { abbreviateAddress } from "@wadzzo/utils/address";
import { Button } from "@wadzzo/ui/components/button";

export function ConnectWalletButton() {
  const session = useSession();

  const setDialog = useConnectWalletDialogStore();
  return (
    <div className="flex items-center gap-2">
      <Button
        size="lg"
        onClick={() => setDialog.setIsOpen(true)}
        className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 p-2 shadow-xs shadow-black"
      >
        <div className="flex items-center gap-2">
          <Image
            alt="logo"
            src={session.data?.user.image ?? "/favicon.ico"}
            height={200}
            width={200}
            className="h-8 w-8 rounded-full border-2 bg-white"
          />

          <span className="">
            {session.status == "authenticated" ? (
              <span className="flex flex-col items-start">
                <p>{session.data?.user.name}</p>
                <p>PUBKEY : {abbreviateAddress(session.data?.user.id)}</p>
              </span>
            ) : (
              "Login/Signup"
            )}
          </span>
        </div>
      </Button>
      {session.status == "authenticated" && <LogOutButton />}
    </div>
  );
}
function LogOutButton() {
  async function disconnectWallet() {
    await signOut({
      redirect: false,
    });
  }
  return (
    <Button className="flex flex-col p-3 shadow-xs shadow-black" onClick={disconnectWallet}>
      <span>
        {" "}
        <LogOut />
      </span>
      <span className="text-xs">Logout</span>
    </Button>
  );
}
