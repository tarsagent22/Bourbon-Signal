import Link from 'next/link';
import LegalPage from '@/components/LegalPage';
import { SUPPORT_EMAIL, SUPPORT_INTRO, SUPPORT_TOPICS } from '../../../shared/support-content';
export const metadata={title:'Support — Bourbon Signal'};
export default function SupportPage(){return <><LegalPage title="How can we help?" updated="October 5, 2026" intro={SUPPORT_INTRO} sections={SUPPORT_TOPICS.map(([heading,copy])=>({heading,body:[copy]}))}/><div className="mx-auto max-w-3xl px-6 pb-12 flex flex-wrap gap-5"><a href={`mailto:${SUPPORT_EMAIL}`}>Email support →</a><Link href="/coverage">Request coverage →</Link><Link href="/settings">Account settings →</Link><Link href="/legal/privacy">Privacy policy →</Link></div></>;}
