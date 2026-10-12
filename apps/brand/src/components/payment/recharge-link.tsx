import { useSession } from "next-auth/react";
import Link from "next/link";
import React from "react";
import { Button } from "@wadzzo/ui/components/button";
import { WalletType } from "@wadzzo/wallet/shared";
import { isRechargeAbleClient } from "~/utils/recharge/is-rechargeable-client";

export default function RechargeLink() {
  const session = useSession();
  const walletType = session.data?.user.walletType ?? WalletType.none;

  const isFBorGoogle = isRechargeAbleClient(walletType);
  if (isFBorGoogle)
    return (
      <Link className="w-full" href={isFBorGoogle ? "/recharge" : "/"}>
        <Button className="w-full shadow-xs shadow-black">Recharge</Button>
      </Link>
    );
}
