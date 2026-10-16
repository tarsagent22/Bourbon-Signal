import { auth } from '@clerk/nextjs/server';
import { getBottleById } from '@/lib/bourbonBible';
import { createBottleProfileHandler } from '@/lib/bottle-profile-route';

const getProfile = createBottleProfileHandler({ authenticate: async () => (await auth()).userId, readBottle: getBottleById });
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return getProfile((await context.params).id);
}
