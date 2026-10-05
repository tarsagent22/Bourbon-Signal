import { requireOwnerPageAccess } from '@/lib/owner-auth';
export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerPageAccess('/admin');
  return children;
}
