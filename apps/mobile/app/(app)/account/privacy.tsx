import { LegalDocument } from '../../../src/components/LegalDocument';
import { PRIVACY_INTRO, PRIVACY_SECTIONS } from '../../../../../shared/legal-content';
export default function Screen() { return <LegalDocument title="Privacy policy" intro={PRIVACY_INTRO} sections={PRIVACY_SECTIONS}/>; }
