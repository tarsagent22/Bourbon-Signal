export const ADMIN_EMAIL = 'chandlertodd22@gmail.com';
export function isAdminEmail(email: unknown): boolean {
  return typeof email === 'string' && email.trim().toLowerCase() === ADMIN_EMAIL;
}
