import { TabList, Tabs, TabSlot, TabTrigger, type TabSlotProps } from "expo-router/ui";
import { StyleSheet, View } from "react-native";
import { Screen } from "react-native-screens";

import { BottomTabBar, LEFT_TABS, RIGHT_TABS } from "~/components/shell/BottomTabBar";

/**
 * The four tabs, headless (expo-router/ui) so the bar can be the web's
 * console with its raised AR launcher. The hidden TabList only registers the
 * routes; BottomTabBar renders the real triggers.
 *
 * A tab you've left stays mounted (instant to return to), detached natively
 * so it isn't drawn. Tabs are NOT frozen (`freezeOnBlur`): freezing froze
 * the native Screen's own props too, and tapping tabs quickly left one stuck
 * on top while the bar moved on. Screens with live data quiet themselves
 * when blurred instead (the map holds its GPS fix and stops the compass).
 */
const renderTab: NonNullable<TabSlotProps["renderFn"]> = (descriptor, { isFocused, loaded, detachInactiveScreens }) => {
  const { lazy = true, unmountOnBlur } = descriptor.options;
  if (unmountOnBlur && !isFocused) return null;
  if (lazy && !loaded && !isFocused) return null;
  return (
    <Screen
      key={descriptor.route.key}
      enabled={detachInactiveScreens}
      activityState={isFocused ? 2 : 0}
      // Each tab fills the slot on its own. expo-router's default flex column
      // relies on `display: none` for blurred tabs, which react-native-screens
      // ignores — every visited tab kept a share of the height. (Never hide a
      // tab with `display: none` either: Fabric destroys hidden native views,
      // and the map broke — "Could not find view with tag …".)
      style={[StyleSheet.absoluteFill, { zIndex: isFocused ? 1 : 0 }]}
    >
      {descriptor.render()}
    </Screen>
  );
};

export default function TabsLayout() {
  return (
    <Tabs>
      <View style={{ flex: 1 }}>
        <TabSlot renderFn={renderTab} />
      </View>
      <TabList style={{ display: "none" }}>
        {[...LEFT_TABS, ...RIGHT_TABS].map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} />
        ))}
        {/* The AR launcher's page (AR / QR / Murals) — a tab so the bar stays. */}
        <TabTrigger name="camera" href="/camera" />
      </TabList>
      <BottomTabBar />
    </Tabs>
  );
}
