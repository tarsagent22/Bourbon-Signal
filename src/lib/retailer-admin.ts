export const RETAILER_ADMIN_EMAIL = "chandlertodd22@gmail.com";

export function isRetailerAdminEmail(email?: string | null) {
  return Boolean(email && email.trim().toLowerCase() === RETAILER_ADMIN_EMAIL);
}
