import { useRef, useState } from "react";
import { api } from "~/utils/api";
import { useSession } from "next-auth/react";
import { signAndSubmitTransaction } from "@wadzzo/wallet";
import { WalletType } from "@wadzzo/wallet/shared";
import toast from "react-hot-toast";
import { Button } from "@wadzzo/ui/components/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@wadzzo/ui/components/dialog";
import { Loader } from "lucide-react";
import { Alert } from "@wadzzo/ui/components/alert";
import { useCustodialSigner } from "@wadzzo/wallet";
import { useUserStellarAcc } from "~/lib/state/wallete/stellar-balances";
import { PLATFORM_ASSET, PLATFORM_FEE, TrxBaseFeeInPlatformAsset } from "@wadzzo/wallet/config";
import { abbreviateAddress } from "@wadzzo/utils/utils";
import { z } from "zod";
import clsx from "clsx";
import { type AssetType } from "~/lib/state/play/use-modal-store";
import { Card, CardContent } from "@wadzzo/ui/components/card";
import BuyWithSquire from "./buy-with-squire";
import RechargeLink from "./recharge-link";
import { Badge } from "@wadzzo/ui/components/badge";

type PaymentProcessProps = {
  item: AssetType;
  placerId?: string | null;
  price: number;
  priceUSD: number;
  marketItemId?: number;
  setClose: () => void;
};
export const PaymentMethodEnum = z.enum(["asset", "xlm", "card"]);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export default function PaymentProcessItem({
  item,
  placerId,
  price,
  priceUSD,
  marketItemId,
  setClose,
}: PaymentProcessProps) {
  const session = useSession();
  const { getCustodialSigner } = useCustodialSigner();
  const { code, issuer } = item;
  const { platformAssetBalance, active, getXLMBalance, balances, hasTrust } = useUserStellarAcc();
  const walletType = session.data?.user.walletType;

  const requiredFee = api.fan.trx.getRequiredPlatformAsset.useQuery({
    xlm: hasTrust(code, issuer) ? 0 : 0.5,
  });

  const [xdr, setXdr] = useState<string>();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>();
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [isBuyDialogOpen, setIsBuyDialogOpen] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);

  const showUSDPrice =
    walletType == WalletType.emailPass ||
    walletType == WalletType.google ||
    walletType == WalletType.facebook;
  const copy = api.marketplace.market.getMarketAssetAvailableCopy.useQuery(
    {
      id: marketItemId,
    },
    {
      enabled: !!marketItemId,
    },
  );

  const xdrMutation = api.marketplace.steller.buyFromMarketPaymentXDR.useMutation({
    onSuccess: (data) => {
      setXdr(data);
    },
    onError: (e) => toast.error(e.message.toString()),
  });

  async function handleXDR(method: PaymentMethod) {
    xdrMutation.mutate({
      placerId,
      assetCode: code,
      issuerPub: issuer,
      limit: 1,
      signWith: getCustodialSigner(),
      method,
    });
  }

  const changePaymentMethod = async (method: PaymentMethod) => {
    setPaymentMethod(method);
    await handleXDR(method);
  };

  const handlePaymentConfirmation = () => {
    setSubmitLoading(true);
    if (!xdrMutation.data) {
      toast.error("XDR data is missing.");
      return;
    }
    signAndSubmitTransaction({
      xdr: xdrMutation.data,
      publicKey: session.data?.user.id,
      walletType: session.data?.user.walletType,
    })
      .then((res) => {
        if (res) {
          toast.success("Payment Successful");
          setClose();
          setPaymentSuccess(true);
          setIsBuyDialogOpen(false);
        }
      })
      .catch((e) => console.log(e))
      .finally(() => {
        setSubmitLoading(false);
        setIsBuyDialogOpen(false);
      });
  };

  if (!active) return null;

  return (
    <div className="mx-auto w-full">
      <Card className="border-0 shadow-xs">
        <CardContent className="space-y-6 p-6">
          {/* Header */}
          <div className="space-y-1 text-center">
            <h2 className="text-xl font-semibold">Checkout</h2>
            <p className="text-muted-foreground text-sm">{item.name}</p>
          </div>

          {/* Item Details */}
          <div className="bg-muted/30 space-y-3 rounded-lg p-4">
            <div className="flex justify-between text-sm">
              <span>Price</span>
              <span className="font-medium">
                {price} {PLATFORM_ASSET.code}
              </span>
            </div>
            {showUSDPrice && (
              <div className="flex justify-between text-sm">
                <span>USD Price</span>
                <span className="font-medium">${priceUSD}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span>Available</span>
              <span className="font-medium">{copy.data ?? "..."}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Issuer</span>
              <span className="font-mono text-xs">{abbreviateAddress(issuer, 7)}</span>
            </div>
          </div>

          {/* Availability Check */}
          {copy.data !== undefined && copy.data < 1 && (
            <Alert variant="destructive" className="text-sm">
              No copies available
            </Alert>
          )}

          {/* Payment Section */}
          {copy.data && copy.data > 0 && (
            <div className="space-y-4">
              <PaymentOptions method={paymentMethod} setIsWallet={changePaymentMethod} />
              <MethodDetails
                paymentMethod={paymentMethod}
                xdrMutation={xdrMutation}
                requiredFee={requiredFee.data}
                price={price}
                priceUSD={priceUSD}
                platformAssetBalance={platformAssetBalance}
                getXLMBalance={getXLMBalance}
                hasTrust={hasTrust}
                code={code}
                issuer={issuer}
                item={item}
                onConfirmPayment={handlePaymentConfirmation}
                submitLoading={submitLoading}
                paymentSuccess={paymentSuccess}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentOptions({
  method,
  setIsWallet,
}: {
  method?: PaymentMethod;
  setIsWallet: (method: PaymentMethod) => void;
}) {
  const session = useSession();
  if (session.status !== "authenticated") return null;

  const walletType = session.data.user.walletType;
  const showCardOption =
    walletType == WalletType.emailPass ||
    walletType == WalletType.google ||
    walletType == WalletType.facebook;

  return (
    <div className="space-y-3">
      <p className="text-center text-sm font-medium">Payment Method</p>
      <div className="grid grid-cols-3 gap-2">
        <Option
          text={PLATFORM_ASSET.code}
          onClick={() => setIsWallet("asset")}
          selected={method === "asset"}
        />
        <Option text="XLM" onClick={() => setIsWallet("xlm")} selected={method === "xlm"} />
        {showCardOption && (
          <Option text="Card" onClick={() => setIsWallet("card")} selected={method === "card"} />
        )}
      </div>
    </div>
  );

  function Option({
    text,
    onClick,
    selected,
  }: {
    text: string;
    onClick: () => void;
    selected?: boolean;
  }) {
    return (
      <Button
        onClick={onClick}
        variant={selected ? "default" : "outline"}
        size="sm"
        className={clsx("w-full justify-center", selected ? "scale-102 shadow-xs" : "")}
      >
        {text}
      </Button>
    );
  }
}

type MethodDetailsProps = {
  paymentMethod?: PaymentMethod;
  xdrMutation: ReturnType<typeof api.marketplace.steller.buyFromMarketPaymentXDR.useMutation>;
  requiredFee?: number;
  price: number;
  priceUSD: number;
  platformAssetBalance: number;
  getXLMBalance: () => string | undefined;
  hasTrust: (code: string, issuer: string) => boolean | undefined;
  code: string;
  issuer: string;
  item: AssetType;
  onConfirmPayment: () => void;
  submitLoading: boolean;
  paymentSuccess: boolean;
};

export function MethodDetails({
  paymentMethod,
  xdrMutation,
  requiredFee,
  price,
  priceUSD,
  platformAssetBalance,
  getXLMBalance,
  hasTrust,
  code,
  issuer,
  item,
  onConfirmPayment,
  submitLoading,
  paymentSuccess,
}: MethodDetailsProps) {
  if (xdrMutation.isPending) {
    return (
      <div className="flex justify-center py-4">
        <Loader className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (xdrMutation.isError) {
    return (
      <Alert variant="destructive" className="text-sm">
        {xdrMutation.error instanceof Error
          ? xdrMutation.error.message
          : "Error processing payment"}
      </Alert>
    );
  }

  if (xdrMutation.isSuccess && requiredFee && paymentMethod) {
    if (paymentMethod === "asset") {
      const requiredAssetBalance = price + requiredFee;
      const isSufficient = platformAssetBalance >= requiredAssetBalance;

      return (
        <div className="space-y-4">
          <div className="bg-muted/30 space-y-2 rounded-lg p-3">
            <div className="flex justify-between text-sm">
              <span>Item Price</span>
              <span>
                {price} {PLATFORM_ASSET.code}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Network Fee</span>
              <span>
                {requiredFee} {PLATFORM_ASSET.code}
              </span>
            </div>
            <div className="flex justify-between border-t pt-2 text-sm font-medium">
              <span>Total</span>
              <span>
                {requiredAssetBalance} {PLATFORM_ASSET.code}
              </span>
            </div>
          </div>

          {isSufficient ? (
            <Button
              onClick={onConfirmPayment}
              disabled={paymentSuccess || submitLoading}
              className="w-full"
            >
              {submitLoading && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Payment
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1 text-center">
                <p className="text-muted-foreground text-sm">Your balance</p>
                <Badge variant="outline">
                  {platformAssetBalance} {PLATFORM_ASSET.code}
                </Badge>
              </div>
              <Alert variant="destructive" className="text-sm">
                Insufficient balance
              </Alert>
              <RechargeLink />
            </div>
          )}
        </div>
      );
    }

    if (paymentMethod === "xlm") {
      const requiredXlm = priceUSD + 2 + (hasTrust(code, issuer) ? 0 : 0.5);
      const currentXlm = parseFloat(getXLMBalance() ?? "0");
      const isSufficient = currentXlm >= requiredXlm;

      return (
        <div className="space-y-4">
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex justify-between text-sm font-medium">
              <span>Total</span>
              <span>{requiredXlm} XLM</span>
            </div>
          </div>

          {isSufficient ? (
            <Button
              onClick={onConfirmPayment}
              disabled={paymentSuccess || submitLoading}
              className="w-full"
            >
              {submitLoading && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Payment
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1 text-center">
                <p className="text-muted-foreground text-sm">Your balance</p>
                <Badge variant="outline">{getXLMBalance()} XLM</Badge>
              </div>
              <Alert variant="destructive" className="text-sm">
                Insufficient balance
              </Alert>
              <RechargeLink />
            </div>
          )}
        </div>
      );
    }

    if (paymentMethod === "card") {
      return (
        <div className="space-y-4">
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-center text-sm">Pay with credit card</p>
          </div>
          <BuyWithSquire marketId={item.id} xdr={xdrMutation.data} />
        </div>
      );
    }
  }

  return null;
}
