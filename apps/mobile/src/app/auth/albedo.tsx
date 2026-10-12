import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { BackButton } from "~/components/shell/ScreenHeader";
import { FormError } from "~/components/ui/Field";
import { Spinner } from "~/components/ui/Spinner";
import { Text } from "~/components/ui/Text";
import { api, SERVER_URL } from "~/lib/api/client";
import { authErrorMessage } from "~/lib/auth/errors";
import { randomToken, signInWithAlbedo } from "~/lib/auth/signIn";
import { useColors } from "~/theme/theme";

type BridgeMessage =
  | { type: "token"; res: { pubkey: string; signature: string } }
  | { type: "xdr"; res: { signed_envelope_xdr: string } }
  | { type: "error"; message: string };

/**
 * Albedo, through wadzzoAR's `/albedo` bridge page in a WebView (same design
 * as the old app, now served by our own server):
 *
 *   /auth/albedo                    → sign in
 *   /auth/albedo?xdr=…&brandId=…    → sign a follow (trustline) transaction,
 *                                     then finish the follow on the server
 */
export default function AlbedoScreen() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { xdr, brandId } = useLocalSearchParams<{ xdr?: string; brandId?: string }>();
  const token = useMemo(() => randomToken(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uri = xdr
    ? `${SERVER_URL}/albedo?xdr=${encodeURIComponent(xdr)}`
    : `${SERVER_URL}/albedo?token=${encodeURIComponent(token)}`;

  const onMessage = async (e: WebViewMessageEvent) => {
    let msg: BridgeMessage;
    try {
      msg = JSON.parse(e.nativeEvent.data) as BridgeMessage;
    } catch {
      return;
    }
    if (msg.type === "error") {
      setError(msg.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (msg.type === "token") {
        await signInWithAlbedo(msg.res, token);
        router.dismissAll();
      } else if (msg.type === "xdr" && brandId) {
        await api(`/brands/${encodeURIComponent(brandId)}/follow`, {
          method: "POST",
          body: { signedXdr: msg.res.signed_envelope_xdr },
        });
        await Promise.all(["brands", "brand", "pins"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
        router.back();
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-ar-bg" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 px-4 py-3">
        <BackButton />
        <Text className="font-hud text-[16px] font-bold text-ar-text">{xdr ? "Approve in Albedo" : "Albedo wallet"}</Text>
      </View>
      {error && (
        <View className="px-4 pb-3">
          <FormError message={error} />
        </View>
      )}
      <WebView
        source={{ uri }}
        onMessage={(e) => void onMessage(e)}
        originWhitelist={["https://*", "http://*"]}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        startInLoadingState
        renderLoading={() => (
          <View className="absolute inset-0 items-center justify-center bg-ar-bg">
            <Spinner />
          </View>
        )}
        style={{ flex: 1, backgroundColor: "transparent" }}
      />
      {busy && (
        <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: c("ar-void", 0.7) }}>
          <Spinner size={30} />
        </View>
      )}
    </View>
  );
}
