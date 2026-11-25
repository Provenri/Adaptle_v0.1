import {
  TabList,
  TabListProps,
  TabSlot,
  Tabs,
  TabTrigger,
  TabTriggerSlotProps,
} from 'expo-router/ui';
import { type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';

import { TabFindIcon, TabLibraryIcon, TabPlayIcon } from './tab-icons';
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
          <TabTrigger name="find" href={'/find' as Href} asChild>
            <TabButton icon={TabFindIcon}>Find</TabButton>
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
        children === 'My Library' && styles.libraryTabButton,
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
    paddingHorizontal: Spacing.three,
    position: 'absolute',
    right: 0,
    pointerEvents: 'box-none',
  },
  innerContainer: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D9DFDB',
    borderRadius: 999,
    borderWidth: 1,
    elevation: 8,
    flexDirection: 'row',
    gap: Spacing.one,
    justifyContent: 'center',
    maxWidth: 480,
    padding: Spacing.two,
    shadowColor: '#173E32',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    width: '100%',
  },
  tabButton: {
    borderRadius: 999,
    flex: 1,
  },
  libraryTabButton: { flex: 1.2 },
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
    paddingHorizontal: Spacing.two,
  },
  tabLabel: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  pressed: { opacity: 0.65 },
});
