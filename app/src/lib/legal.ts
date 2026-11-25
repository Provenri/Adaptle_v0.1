export type LegalConfig = {
  operatorName: string;
  postalAddress: string;
  contactEmail: string;
  directContact: string;
  entityDetails: string;
  responsiblePerson: string;
};

export const LEGAL_CONFIG: LegalConfig = {
  operatorName: process.env.EXPO_PUBLIC_IMPRESSUM_OPERATOR_NAME?.trim() ?? '',
  postalAddress: process.env.EXPO_PUBLIC_IMPRESSUM_POSTAL_ADDRESS?.trim() ?? '',
  contactEmail: process.env.EXPO_PUBLIC_IMPRESSUM_EMAIL?.trim() || 'adaptle.app@gmail.com',
  directContact: process.env.EXPO_PUBLIC_IMPRESSUM_DIRECT_CONTACT?.trim() ?? '',
  entityDetails: process.env.EXPO_PUBLIC_IMPRESSUM_ENTITY_DETAILS?.trim() ?? '',
  responsiblePerson: process.env.EXPO_PUBLIC_IMPRESSUM_RESPONSIBLE_PERSON?.trim() ?? '',
};

export function isImpressumComplete(config: LegalConfig = LEGAL_CONFIG): boolean {
  return Boolean(config.operatorName && config.postalAddress && config.contactEmail);
}
