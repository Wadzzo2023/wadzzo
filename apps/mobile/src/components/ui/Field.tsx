import { Eye, EyeOff } from "lucide-react-native";
import { forwardRef, useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";

import { cn } from "~/lib/utils";
import { useColors } from "~/theme/theme";

import { Text } from "./Text";

/** A labelled input in the app's bevel style, with inline error and show/hide. */
export const Field = forwardRef<TextInput, TextInputProps & { label: string; error?: string | null; secure?: boolean }>(
  function Field({ label, error, secure, className, ...props }, ref) {
    const { c } = useColors();
    const [hidden, setHidden] = useState(true);
    const [focused, setFocused] = useState(false);
    return (
      <View className={cn("gap-1.5", className)}>
        <Text className="font-hud text-[10px] font-semibold uppercase tracking-[1.8px] text-ar-faint">{label}</Text>
        <View
          className="h-12 flex-row items-center rounded-ar border bg-ar-surface-2 px-3.5"
          style={{ borderColor: error ? c("ar-danger", 0.6) : focused ? c("ar-green", 0.55) : c("ar-line") }}
        >
          <TextInput
            ref={ref}
            placeholderTextColor={c("ar-text-faint")}
            secureTextEntry={secure && hidden}
            onFocus={(e) => {
              setFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              props.onBlur?.(e);
            }}
            className="flex-1 text-[15px] text-ar-text"
            style={{ fontFamily: "Sora_400Regular" }}
            {...props}
          />
          {secure && (
            <Pressable onPress={() => setHidden((h) => !h)} accessibilityLabel={hidden ? "Show password" : "Hide password"} hitSlop={10}>
              {hidden ? <Eye size={17} color={c("ar-text-faint")} /> : <EyeOff size={17} color={c("ar-text-faint")} />}
            </Pressable>
          )}
        </View>
        {error ? <Text className="text-[12px] text-ar-danger">{error}</Text> : null}
      </View>
    );
  },
);

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View className="rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-2.5">
      <Text className="text-[12px] leading-5 text-ar-danger">{message}</Text>
    </View>
  );
}
