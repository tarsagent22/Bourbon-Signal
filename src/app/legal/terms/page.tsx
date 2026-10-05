import LegalPage from '@/components/LegalPage';
import { LEGAL_UPDATED, TERMS_INTRO, TERMS_SECTIONS } from '../../../../shared/legal-content';
export const metadata = {title:'Terms of service — Bourbon Signal'};
export default function Page() {return <LegalPage title="Terms of service" updated={LEGAL_UPDATED} intro={TERMS_INTRO} sections={TERMS_SECTIONS.map(([heading,paragraphs])=>({heading,body:[...paragraphs]}))}/>;}
