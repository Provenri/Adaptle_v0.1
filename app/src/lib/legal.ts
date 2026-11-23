export const LEGAL_CONFIG = {
  operatorName: process.env.EXPO_PUBLIC_IMPRESSUM_OPERATOR_NAME?.trim() ?? '',
  postalAddress: process.env.EXPO_PUBLIC_IMPRESSUM_POSTAL_ADDRESS?.trim() ?? '',
  contactEmail: process.env.EXPO_PUBLIC_IMPRESSUM_EMAIL?.trim() ?? 'adaptle.privacy@gmail.com',
  directContact: process.env.EXPO_PUBLIC_IMPRESSUM_DIRECT_CONTACT?.trim() ?? '',
  entityDetails: process.env.EXPO_PUBLIC_IMPRESSUM_ENTITY_DETAILS?.trim() ?? '',
  responsiblePerson: process.env.EXPO_PUBLIC_IMPRESSUM_RESPONSIBLE_PERSON?.trim() ?? '',
};

export function isImpressumComplete(): boolean {
  return Boolean(
    LEGAL_CONFIG.operatorName &&
    LEGAL_CONFIG.postalAddress &&
    LEGAL_CONFIG.contactEmail &&
    LEGAL_CONFIG.directContact
  );
}
