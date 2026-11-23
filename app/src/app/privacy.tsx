import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { APP_ICON } from '@/assets';
import { getSupabaseClient, initializeAnonymousSession } from '@/lib/supabase';
import { LEGAL_CONFIG } from '@/lib/legal';

const CONTACT_EMAIL = LEGAL_CONFIG.contactEmail;
const EFFECTIVE_DATE = '21 November 2026';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <PrivacyPolicyContent
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/library'))}
    />
  );
}

export function PrivacyPolicyContent({ onBack }: { onBack: () => void }) {
  const [anonymousId, setAnonymousId] = useState<string | null>(null);

  useEffect(() => {
    void getAnonymousId()
      .then(setAnonymousId)
      .catch(() => setAnonymousId(null));
  }, []);

  const requestDeletion = () => {
    const body = [
      'Please delete my Adaptle data.',
      anonymousId ? `Anonymous user ID: ${anonymousId}` : '',
      '',
      'I understand that deletion cannot be reversed.',
    ]
      .filter(Boolean)
      .join('\n');
    void Linking.openURL(
      `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Adaptle data deletion request')}&body=${encodeURIComponent(body)}`
    );
  };

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          testID="privacy-policy">
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
            <ThemedText type="smallBold">← Back</ThemedText>
          </Pressable>

          <View style={styles.brandRow}>
            <Image
              accessibilityLabel="Adaptle"
              contentFit="contain"
              source={APP_ICON}
              style={styles.headerLogo}
            />
            <View>
              <ThemedText type="subtitle">Privacy Policy</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Adaptle · Effective {EFFECTIVE_DATE}
              </ThemedText>
            </View>
          </View>

          <PolicySection title="1. About Adaptle">
            <PolicyText>
              Adaptle is a daily book-to-screen trivia and reading-list app. This policy explains
              what information Adaptle processes, why it is processed, and how you can request
              access or deletion.
            </PolicyText>
            <PolicyText>
              Privacy contact: <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>
            </PolicyText>
          </PolicySection>

          <PolicySection title="2. Information we process">
            <PolicyText>
              <PolicyStrong>Anonymous account data.</PolicyStrong> Adaptle does not require a name,
              email address, password, or public profile for normal use. Supabase creates an
              anonymous user ID so your saved books, daily scores, and streak can be synchronized.
            </PolicyText>
            <PolicyText>
              <PolicyStrong>Your library and game data.</PolicyStrong> We store book ISBNs and
              factual catalog metadata such as publication year, your shelf status, daily puzzle
              date, round breakdown, score, and completion time.
            </PolicyText>
            <PolicyText>
              <PolicyStrong>Search and ISBN data.</PolicyStrong> Book searches and scanned or typed
              ISBNs are sent to the Adaptle backend to obtain factual book metadata. Search data is
              not used for advertising.
            </PolicyText>
            <PolicyText>
              <PolicyStrong>Technical data.</PolicyStrong> Backend and distribution services may
              process connection information such as IP address, request time, device/OS type,
              anonymous session identifier, and basic operational logs for security, delivery, and
              diagnostics. Adaptle does not include an advertising-ID or third-party crash-analytics
              SDK.
            </PolicyText>
            <PolicyText>
              <PolicyStrong>Contact submissions.</PolicyStrong> If you use the contact form, Adaptle
              stores the category, subject, message, reply email, optional name, anonymous account
              ID, and submission time so the request can be answered or investigated. Do not include
              passwords, payment information, or other unrelated sensitive data.
            </PolicyText>
            <PolicyText>
              <PolicyStrong>Local device storage.</PolicyStrong> Cached puzzles, your library,
              scores, pending offline changes, and the anonymous session are stored locally with
              MMKV so the app works across restarts and offline.
            </PolicyText>
          </PolicySection>

          <PolicySection title="3. How information is used">
            <PolicyText>
              We use information only to provide and secure the app: authenticate anonymous
              sessions, load daily puzzles, save and synchronize your shelf and scores, calculate
              streaks, process book searches and ISBN lookups, retrieve factual movie information
              and streaming availability, maintain service reliability, and respond to support or
              privacy requests.
            </PolicyText>
            <PolicyText>
              Adaptle does not sell personal information and does not use your data for behavioral
              advertising.
            </PolicyText>
          </PolicySection>

          <PolicySection title="4. Service providers and third parties">
            <PolicyText>
              <PolicyStrong>Supabase</PolicyStrong> provides the database, anonymous authentication,
              and Edge Functions. See{' '}
              <Link href="https://supabase.com/privacy">supabase.com/privacy</Link>.
            </PolicyText>
            <PolicyText>
              <PolicyStrong>The Movie Database (TMDB)</PolicyStrong> receives movie IDs to retrieve
              factual movie information and watch-provider availability. This product uses the TMDB
              API but is not endorsed or certified by TMDB. See{' '}
              <Link href="https://www.themoviedb.org/privacy-policy">
                themoviedb.org/privacy-policy
              </Link>
              .
            </PolicyText>
            <PolicyText>
              <PolicyStrong>Open Library</PolicyStrong> and{' '}
              <PolicyStrong>Google Books</PolicyStrong> receive title/author searches or ISBNs to
              return factual bibliographic metadata. Adaptle does not request publisher cover images
              or descriptions. See{' '}
              <Link href="https://openlibrary.org/privacy">Open Library privacy</Link> and{' '}
              <Link href="https://policies.google.com/privacy">Google privacy</Link>.
            </PolicyText>
            <PolicyText>
              <PolicyStrong>Expo and Google Play</PolicyStrong> provide app builds, distribution,
              updates, and platform delivery. Their systems may process required installation,
              connection, and account information. See{' '}
              <Link href="https://expo.dev/privacy">expo.dev/privacy</Link> and{' '}
              <Link href="https://policies.google.com/privacy">policies.google.com/privacy</Link>.
            </PolicyText>
            <PolicyText>
              If configured, a transactional email provider sends contact-notification messages to
              the Adaptle support mailbox. Your reply email is used only to respond to your request.
            </PolicyText>
          </PolicySection>

          <PolicySection title="5. Storage, security, and retention">
            <PolicyText>
              Data sent between the app and Adaptle&apos;s providers uses HTTPS/TLS. Access to
              personal library and score rows is protected by Supabase row-level security tied to
              the anonymous user.
            </PolicyText>
            <PolicyText>
              Removing a book from your library deletes its personal shelf row, while the
              copyright-safe catalog facts remain available to other users. Server-side score data
              and any remaining library data is retained until you request deletion or the service
              must retain a limited record for legal, security, or operational reasons. Local cached
              data remains until you clear the app&apos;s storage or uninstall the app.
            </PolicyText>
          </PolicySection>

          <PolicySection title="6. Your rights and data deletion">
            <PolicyText>
              Depending on applicable law, including GDPR, you may ask to access, correct, restrict,
              or erase personal data, receive a copy of eligible data, object to processing, or
              lodge a complaint with your local data-protection authority.
            </PolicyText>
            <PolicyText>
              To request deletion or another privacy action, contact {CONTACT_EMAIL}. Include the
              anonymous user ID shown below, if available, so the correct records can be identified.
            </PolicyText>

            <ThemedView type="backgroundElement" style={styles.idCard}>
              <ThemedText type="smallBold">Anonymous user ID</ThemedText>
              <ThemedText selectable type="code">
                {anonymousId ?? 'Not available yet'}
              </ThemedText>
            </ThemedView>

            <Pressable
              accessibilityRole="button"
              onPress={requestDeletion}
              style={styles.emailButton}>
              <ThemedText type="smallBold" style={styles.lightText}>
                Request data deletion
              </ThemedText>
            </Pressable>
            <PolicyText>
              You may also clear the app&apos;s local storage through Android settings or by
              uninstalling the app. Clearing local storage alone does not delete
              already-synchronized Supabase records, so email {CONTACT_EMAIL} for server-side
              deletion.
            </PolicyText>
            <PolicyText>
              Contact requests are normally retained for six months after resolution unless a
              privacy, legal, security, copyright, or fraud investigation requires longer retention.
            </PolicyText>
          </PolicySection>

          <PolicySection title="7. Children's privacy">
            <PolicyText>
              Adaptle is intended for a general audience and is not directed to children under 13,
              or under 16 where that higher age applies. We do not knowingly collect personal data
              from children. Contact {CONTACT_EMAIL} if a child&apos;s data may have been provided.
            </PolicyText>
          </PolicySection>

          <PolicySection title="8. Changes to this policy">
            <PolicyText>
              We may update this policy when the app or legal requirements change. The effective
              date above will be revised, and material changes will be made available in the app.
            </PolicyText>
          </PolicySection>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

async function getAnonymousId(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  await initializeAnonymousSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

function PolicyText({ children }: { children: React.ReactNode }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.policyText}>
      {children}
    </ThemedText>
  );
}

function PolicyStrong({ children }: { children: React.ReactNode }) {
  return <ThemedText type="smallBold">{children}</ThemedText>;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  safeArea: { flex: 1, maxWidth: MaxContentWidth, width: '100%' },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  backButton: { alignSelf: 'flex-start', paddingVertical: Spacing.two },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.three,
  },
  headerLogo: {
    borderRadius: 12,
    height: 52,
    width: 52,
  },
  section: { gap: Spacing.two },
  sectionTitle: {
    color: '#173E32',
    fontSize: 18,
    lineHeight: 24,
  },
  policyText: { lineHeight: 22 },
  idCard: { borderRadius: 12, gap: Spacing.one, padding: Spacing.three },
  emailButton: {
    alignItems: 'center',
    backgroundColor: '#173E32',
    borderRadius: 999,
    padding: Spacing.three,
  },
  lightText: { color: '#FFFFFF' },
});
