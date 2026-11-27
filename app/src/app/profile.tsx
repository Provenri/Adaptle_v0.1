import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OpenBookArchAppIcon } from '@/components/OpenBookArchAppIcon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Depth, MaxContentWidth, Spacing } from '@/constants/theme';

const PROFILE_LINKS = [
  { label: 'Contact', href: '/contact' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Impressum', href: '/impressum' },
] as const;

export default function ProfileScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headingRow}>
            <View style={styles.brandRow}>
              <View style={styles.headerLogoSlot}>
                <OpenBookArchAppIcon size={48} />
              </View>
              <ThemedText numberOfLines={1} style={styles.headerTitle} type="subtitle">
                Profile
              </ThemedText>
            </View>
          </View>

          <Pressable
            accessibilityHint="User profiles are not available yet."
            accessibilityLabel="User"
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            disabled
            style={styles.disabledRow}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              User
            </ThemedText>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Soon
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary" style={styles.userHint}>
            Account features are coming soon.
          </ThemedText>

          <View style={styles.links}>
            {PROFILE_LINKS.map((item) => (
              <Pressable
                accessibilityLabel={item.label}
                accessibilityRole="button"
                key={item.href}
                onPress={() => router.push(item.href as Href)}
                style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.linkLabel}>
                  {item.label}
                </ThemedText>
                <ThemedText style={styles.chevron} themeColor="textSecondary">
                  ›
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1 },
  safeArea: { flex: 1, maxWidth: MaxContentWidth, width: '100%' },
  content: {
    gap: Spacing.three,
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  headingRow: { minHeight: 56, justifyContent: 'center' },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  headerLogoSlot: {
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  headerTitle: {
    color: '#143326',
    fontSize: 24,
    fontWeight: 800,
    lineHeight: 32,
  },
  disabledRow: {
    alignItems: 'center',
    backgroundColor: '#F4EEE6',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    opacity: 0.65,
    padding: Spacing.three,
  },
  userHint: { paddingHorizontal: Spacing.two },
  links: {
    ...Depth.raised,
    backgroundColor: '#F8F4EE',
    borderRadius: 18,
    overflow: 'hidden',
  },
  linkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    width: '100%',
  },
  linkLabel: { flex: 1 },
  chevron: { fontSize: 24, lineHeight: 24, textAlign: 'right' },
  pressed: { backgroundColor: '#EDF3EC' },
});
