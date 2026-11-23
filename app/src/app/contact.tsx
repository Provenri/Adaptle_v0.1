import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { CONTACT_CATEGORIES, type ContactCategory } from '@/lib/contact';
import { LEGAL_CONFIG } from '@/lib/legal';
import { submitContactRequest } from '@/lib/supabase';

export default function ContactScreen() {
  const router = useRouter();
  return (
    <ContactContent
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/library'))}
    />
  );
}

export function ContactContent({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [category, setCategory] = useState<ContactCategory>('GENERAL');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [website, setWebsite] = useState('');
  const [startedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const submit = async () => {
    const email = replyEmail.trim();
    if (!subject.trim() || subject.trim().length < 3) {
      Alert.alert('Subject required', 'Enter a subject of at least 3 characters.');
      return;
    }
    if (!email) {
      Alert.alert('Reply email required', 'Enter an email address so we can respond.');
      return;
    }
    if (message.trim().length < 10) {
      Alert.alert('Message required', 'Enter a message of at least 10 characters.');
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Invalid email', 'Enter a valid reply email or leave it blank.');
      return;
    }
    if (!privacyAccepted) {
      Alert.alert('Privacy acknowledgement required', 'Confirm the privacy notice before sending.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitContactRequest({
        category,
        subject: subject.trim(),
        message: message.trim(),
        name: name.trim() || undefined,
        replyEmail: email,
        privacyAccepted,
        website,
        submittedAt: startedAt,
      });
      setSent(result.requestId);
    } catch (error) {
      Alert.alert(
        'Message not sent',
        error instanceof Error ? error.message : 'Please try again or use email.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
            <ThemedText type="smallBold">← Back</ThemedText>
          </Pressable>
          <ThemedText type="subtitle">Contact Adaptle</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
            Use this form for support, privacy, rights, or legal questions. Do not send passwords,
            payment details, or other sensitive secrets.
          </ThemedText>

          {sent ? (
            <View style={styles.success}>
              <ThemedText type="smallBold">Message received</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Reference: {sent}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                If an email notification is not configured, the request is still stored securely for
                follow-up.
              </ThemedText>
              <Pressable accessibilityRole="button" onPress={onBack} style={styles.primaryButton}>
                <ThemedText type="smallBold" style={styles.lightText}>
                  Done
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.form}>
              <TextInput
                accessibilityLabel="Your name"
                maxLength={100}
                onChangeText={setName}
                placeholder="Name (optional)"
                placeholderTextColor="#737B78"
                style={styles.input}
                value={name}
              />
              <TextInput
                accessibilityLabel="Reply email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                maxLength={254}
                onChangeText={setReplyEmail}
                placeholder="Reply email"
                placeholderTextColor="#737B78"
                style={styles.input}
                value={replyEmail}
              />
              <ThemedText type="smallBold">Request type</ThemedText>
              <View style={styles.categories}>
                {CONTACT_CATEGORIES.map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: category === item.value }}
                    key={item.value}
                    onPress={() => setCategory(item.value)}
                    style={[styles.category, category === item.value && styles.categorySelected]}>
                    <ThemedText
                      type="smallBold"
                      style={category === item.value ? styles.lightText : styles.categoryText}>
                      {item.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <TextInput
                accessibilityLabel="Subject"
                maxLength={120}
                onChangeText={setSubject}
                placeholder="Subject"
                placeholderTextColor="#737B78"
                style={styles.input}
                value={subject}
              />
              <TextInput
                accessibilityLabel="Message"
                maxLength={5000}
                multiline
                onChangeText={setMessage}
                placeholder="How can we help?"
                placeholderTextColor="#737B78"
                style={[styles.input, styles.message]}
                textAlignVertical="top"
                value={message}
              />
              <View style={styles.hiddenField}>
                <TextInput accessibilityLabel="Website" onChangeText={setWebsite} value={website} />
              </View>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: privacyAccepted }}
                onPress={() => setPrivacyAccepted((value) => !value)}
                style={styles.consent}>
                <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
                  {privacyAccepted ? <ThemedText style={styles.lightText}>✓</ThemedText> : null}
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.consentText}>
                  I have read the{' '}
                  <Link href="/privacy" style={styles.link}>
                    Privacy Policy
                  </Link>{' '}
                  and agree that Adaptle may use this message to respond.
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting }}
                onPress={() => void submit()}
                style={[styles.primaryButton, submitting && styles.disabled]}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText type="smallBold" style={styles.lightText}>
                    Send message
                  </ThemedText>
                )}
              </Pressable>
              <ThemedText type="small" themeColor="textSecondary" style={styles.directEmail}>
                You can also contact {LEGAL_CONFIG.contactEmail} directly.
              </ThemedText>
            </View>
          )}
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
  backButton: { alignSelf: 'flex-start', paddingVertical: Spacing.two },
  intro: { lineHeight: 22 },
  form: { gap: Spacing.three },
  input: {
    backgroundColor: '#F8F4EE',
    borderColor: '#CCD2CF',
    borderRadius: 12,
    borderWidth: 1,
    color: '#111111',
    fontSize: 16,
    padding: Spacing.three,
  },
  message: { minHeight: 160 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  category: {
    borderColor: '#173E32',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  categorySelected: { backgroundColor: '#173E32' },
  categoryText: { color: '#173E32' },
  consent: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.two },
  checkbox: {
    alignItems: 'center',
    borderColor: '#173E32',
    borderRadius: 4,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkboxChecked: { backgroundColor: '#173E32' },
  consentText: { flex: 1, lineHeight: 20 },
  link: { color: '#117579', textDecorationLine: 'underline' },
  hiddenField: { display: 'none' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#173E32',
    borderRadius: 999,
    padding: Spacing.three,
  },
  disabled: { opacity: 0.6 },
  lightText: { color: '#FFFFFF' },
  directEmail: { lineHeight: 20, textAlign: 'center' },
  success: {
    backgroundColor: '#F4EEE6',
    borderRadius: 16,
    gap: Spacing.two,
    padding: Spacing.four,
  },
});
