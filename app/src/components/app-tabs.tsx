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

import { MaxContentWidth, Spacing } from '@/constants/theme';

import { TabLibraryIcon, TabPlayIcon } from './tab-icons';
import { ThemedText } from './themed-text';

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
  icon: (props: { color: string; active?: boolean }) => React.ReactNode;
};

export function TabButton({ children, icon: Icon, isFocused, ...props }: TabButtonProps) {
  const color = isFocused ? '#FFFFFF' : '#163C32';
  return (
    <Pressable
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      {...(props as React.ComponentProps<typeof Pressable>)}
      style={({ pressed }) => [
        styles.tabButton,
        isFocused && styles.tabButtonSelected,
        pressed && styles.pressed,
      ]}>
      <View style={styles.tabButtonContent}>
        <Icon color={color} active={isFocused} />
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
      <View style={styles.innerContainer}>{props.children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabSlot: { height: '100%' },
  tabListContainer: {
    alignItems: 'center',
    bottom: 0,
    flexDirection: 'row',
    left: 0,
    position: 'absolute',
    right: 0,
    pointerEvents: 'box-none',
  },
  innerContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.three,
    justifyContent: 'center',
    maxWidth: MaxContentWidth,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    width: '100%',
  },
  tabButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    flex: 1,
    maxWidth: 190,
    shadowColor: '#173E32',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 5,
  },
  tabButtonSelected: {
    backgroundColor: '#163C32',
    borderWidth: 0,
  },
  tabButtonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: Spacing.three,
  },
  tabLabel: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  pressed: { opacity: 0.65 },
});
