import LegalPage from '@/components/LegalPage';
import { LEGAL_UPDATED, PRIVACY_INTRO, PRIVACY_SECTIONS } from '../../../../shared/legal-content';
export const metadata = {title:'Privacy policy — Bourbon Signal'};
export default function Page() {return <LegalPage title="Privacy policy" updated={LEGAL_UPDATED} intro={PRIVACY_INTRO} sections={PRIVACY_SECTIONS.map(([heading,paragraphs])=>({heading,body:[...paragraphs]}))}/>;}
