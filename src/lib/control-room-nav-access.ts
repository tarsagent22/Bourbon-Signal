const CONTROL_ROOM_NAV_OWNER_EMAIL = "chandlertodd22@gmail.com";

type NavigationUser = {
  primaryEmailAddressId?: string | null;
  emailAddresses?: Array<{ id?: string; emailAddress?: string }>;
};

export function controlRoomNavVisibleForUser(user: NavigationUser | null | undefined) {
  if (!user || !Array.isArray(user.emailAddresses)) return false;
  const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
  return primary?.emailAddress?.trim().toLowerCase() === CONTROL_ROOM_NAV_OWNER_EMAIL;
}
