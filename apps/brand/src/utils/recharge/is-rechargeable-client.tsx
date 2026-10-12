import { WalletType } from "@wadzzo/wallet/shared";

export function isRechargeAbleClient(walletType: WalletType): boolean {
    return (
        walletType == WalletType.facebook ||
        walletType == WalletType.google ||
        walletType == WalletType.emailPass ||
        walletType == WalletType.apple
    );
}