# Production pilot evidence

This evidence branch records the bounded Shopify pilot. It is not a production release branch. The application remains on the reviewed merge be8ad383b04d08882fe753958a95be2e118dd707.

At this checkpoint repeated scheduled acceptance is pending; see pilot-report.md. Source and scope decisions are in docs/operations/nationwide-coverage-pilot-20261022.md and nationwide-coverage-research-20261022.md on main.

Verification source files are archived verbatim as .txt. To rerun them, restore their original names into .operator/ at the repository root of the reviewed release, install the existing dependencies, generate the deterministic Bible, and supply the explicit local artifact and maintenance paths. These archives contain no credentials. Queue SQL performs aggregate SELECTs only. Synthetic checks do not count as production proof.

JSON and log bytes in this folder are preserved by the local .gitattributes so their SHA-256 hashes survive checkout.
