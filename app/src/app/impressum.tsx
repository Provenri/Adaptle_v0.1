import { Link, useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { isImpressumComplete, LEGAL_CONFIG } from '@/lib/legal';

export default function ImpressumScreen() {
  const router = useRouter();
  return (
    <ImpressumContent
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/library'))}
    />
  );
}

export function ImpressumContent({ onBack }: { onBack: () => void }) {
  const complete = isImpressumComplete();
  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
            <ThemedText type="smallBold">← Back</ThemedText>
          </Pressable>
          <ThemedText type="subtitle">Impressum</ThemedText>
          {!complete ? (
            <View style={styles.notice}>
              <ThemedText type="smallBold" style={styles.noticeTitle}>
                Legal details configuration incomplete
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Adaptle must not publish this page as a completed Impressum until the
                operator&apos;s real name, serviceable postal address, immediate contact route, and
                applicable entity details are configured.
              </ThemedText>
            </View>
          ) : null}

          <LegalSection title="Angaben gemäß § 5 DDG">
            <ThemedText type="small">{LEGAL_CONFIG.operatorName || 'Not configured'}</ThemedText>
            <ThemedText type="small">{LEGAL_CONFIG.postalAddress || 'Not configured'}</ThemedText>
          </LegalSection>
          <LegalSection title="Kontakt">
            <ThemedText type="small">
              E-Mail:{' '}
              <Link href={`mailto:${LEGAL_CONFIG.contactEmail}`} style={styles.link}>
                {LEGAL_CONFIG.contactEmail}
              </Link>
            </ThemedText>
            <ThemedText type="small">
              Direktkontakt: {LEGAL_CONFIG.directContact || 'Not configured'}
            </ThemedText>
            <Link href={'/contact' as Href} style={styles.link}>
              <ThemedText type="small" style={styles.link}>
                Kontaktformular
              </ThemedText>
            </Link>
          </LegalSection>
          {LEGAL_CONFIG.entityDetails ? (
            <LegalSection title="Weitere Angaben">
              <ThemedText type="small">{LEGAL_CONFIG.entityDetails}</ThemedText>
            </LegalSection>
          ) : null}
          {LEGAL_CONFIG.responsiblePerson ? (
            <LegalSection title="Verantwortlich für den Inhalt">
              <ThemedText type="small">{LEGAL_CONFIG.responsiblePerson}</ThemedText>
            </LegalSection>
          ) : null}
          <LegalSection title="Hinweis">
            <ThemedText type="small" themeColor="textSecondary">
              Contact requests are processed under the terms described in the{' '}
              <Link href="/privacy" style={styles.link}>
                Privacy Policy
              </Link>
              .
            </ThemedText>
          </LegalSection>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {children}
    </View>
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
  backButton: { alignSelf: 'flex-start', paddingVertical: Spacing.two },
  notice: {
    backgroundColor: '#FFF1D5',
    borderRadius: 12,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  noticeTitle: { color: '#8A4B16' },
  section: { gap: Spacing.one },
  sectionTitle: { color: '#173E32', fontSize: 17, lineHeight: 22 },
  link: { color: '#117579', textDecorationLine: 'underline' },
});
