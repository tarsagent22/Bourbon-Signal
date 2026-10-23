# Verified production pilot evidence

The bounded Shopify collection pilot is verified; begin with pilot-report.md, pilot-metrics.json and acceptance-final.json. This branch records evidence and does not deploy the application. Production remains on reviewed merge be8ad383b04d08882fe753958a95be2e118dd707 from PR817. Further source scale is paused behind maintenance finding818 and regional operational review.

The index retains all five verification captures, including the first final-check generation mismatch and the subsequent normal convergence. GitHub artifact metadata records each authenticated download, archive digest and source commit. The committed copies outlive the thirty-day Actions artifact retention. Queue proof JSON files are referenced by exact immutable Git commits in maintenance.json and were compared byte-for-byte through the GitHub contents API.

Verification source is archived verbatim as .txt. Restore original filenames into .operator/ at the root of the reviewed source, install existing dependencies and generate the deterministic Bible to replay local offline evaluation. Capture/index and maintenance paths are explicit inputs. Authorized production credentials are required only for read-only online captures; no credentials are archived here. Queue SQL selects aggregate counts only. Offline checks: evaluate-soak.mjs --self-test-current; queue-proof-checks.mjs; capture-soak-queue-audit.mjs --self-test. Synthetic checks are not production proof.

JSON and log bytes are preserved by .gitattributes. The manifest hashes the evidence files, excluding itself.
