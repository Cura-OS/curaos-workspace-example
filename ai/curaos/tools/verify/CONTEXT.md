# CONTEXT - tools/verify (air-gap supply-chain verification)

AI-mirror node for `curaos/tools/verify/` (per workspace AGENTS.md section 1
1:1 structural mirror). Code + canonical docs live in the curaos repo:

- Harness: `curaos/tools/verify/cosign-verify.sh` (offline cosign signature +
  provenance attestation verification for the CuraOS Core Air-Gap Bundle).
- Usage + scope: [`curaos/tools/verify/README.md`](../../../../curaos/tools/verify/README.md)

## Decisions

- **Offline-first.** Verification must run inside the air-gapped environment
  with no registry egress, matching [[curaos-airgap-rule]] (Zarf singular
  bundle) and [[curaos-image-build-rule]] (digest-pinned, signed images).
- Operator-driven: this harness is evidence tooling for bundle acceptance, not
  a local-CI gate.
