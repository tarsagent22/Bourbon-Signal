import { LegalDocument } from '../../../src/components/LegalDocument';
import { TERMS_INTRO, TERMS_SECTIONS } from '../../../../../shared/legal-content';
export default function Screen() { return <LegalDocument title="Terms of service" intro={TERMS_INTRO} sections={TERMS_SECTIONS}/>; }
