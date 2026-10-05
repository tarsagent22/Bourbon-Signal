import { ADMIN_EMAIL, isAdminEmail } from "../../shared/admin-access.ts";
export const RETAILER_ADMIN_EMAIL = ADMIN_EMAIL;
export function isRetailerAdminEmail(email?: string | null) { return isAdminEmail(email); }
