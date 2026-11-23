export const CONTACT_CATEGORIES = [
  { value: 'GENERAL', label: 'General question' },
  { value: 'SUPPORT', label: 'App/support issue' },
  { value: 'PRIVACY', label: 'Privacy request' },
  { value: 'COPYRIGHT', label: 'Copyright/rights report' },
  { value: 'LEGAL', label: 'Legal/other' },
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number]['value'];

export type ContactSubmission = {
  category: ContactCategory;
  subject: string;
  message: string;
  name?: string;
  replyEmail: string;
  privacyAccepted: boolean;
  website?: string;
  submittedAt: number;
  anonymousUserId?: string;
};
