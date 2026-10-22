/** Keep default recipient labels within the existing VARCHAR(255) field. */
export function defaultSchoolWhatsappRecipient(schoolName: string): string {
  return Array.from(`TSA - ${schoolName.trim()}`).slice(0, 255).join("");
}
export function schoolWhatsappRecipient(schoolName: string, entered: string, previousSchoolName?: string): string {
  const value = entered.trim();
  if (!value || previousSchoolName !== undefined && value === defaultSchoolWhatsappRecipient(previousSchoolName)) {
    return defaultSchoolWhatsappRecipient(schoolName);
  }
  return value;
}
