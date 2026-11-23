import {
  TabList,
  TabListProps,
  TabSlot,
  Tabs,
  TabTrigger,
  TabTriggerSlotProps,
} from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

import { TabLibraryIcon, TabPlayIcon } from './tab-icons';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={styles.tabSlot} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon={TabPlayIcon}>Play</TabButton>
          </TabTrigger>
          <TabTrigger name="library" href="/library" asChild>
            <TabButton icon={TabLibraryIcon}>My Library</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

type TabButtonProps = TabTriggerSlotProps & {
  icon: (props: { color: string }) => React.ReactNode;
};

export function TabButton({ children, icon: Icon, isFocused, ...props }: TabButtonProps) {
  const color = isFocused ? '#117579' : Colors.light.textSecondary;
  return (
    <Pressable
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      {...(props as React.ComponentProps<typeof Pressable>)}
      style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
      <View style={styles.tabButtonContent}>
        <Icon color={color} />
        <ThemedText style={[styles.tabLabel, { color }]}>{children}</ThemedText>
      </View>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      {...props}
      style={[styles.tabListContainer, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      <ThemedView type="background" style={styles.innerContainer}>
        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabSlot: { height: '100%' },
  tabListContainer: {
    alignItems: 'center',
    borderTopColor: '#E0E1E6',
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    flexDirection: 'row',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  innerContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-around',
    maxWidth: MaxContentWidth,
    minHeight: 58,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.one,
    width: '100%',
  },
  tabButton: { flex: 1, maxWidth: 180 },
  tabButtonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 52,
  },
  tabLabel: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  pressed: { opacity: 0.65 },
});
