# Grill: M12 #373 esign verification pipeline (byte-free PKCS#7 chain + OCSP/CRL + RFC-3161 TSA)

- Issue: your-org/curaos-ai-workspace#373
- Lane: claude-373 (dispatched)
- Grill: Claude -> Codex (opposite-harness adversarial planning review)
- Reviewer: codex `gpt-5.4`, reasoning effort `medium`, sandbox read-only
- Date: 2026-06-08
- Verdict: scope resolution ENDORSED; no user-escalation candidates if recommendation accepted.

Note: the `opposite-harness-grill` workflow's 18s probe alarm killed the harness-probe (codex cold-start > 18s, the known false-positive class from session-23 / #507), even though codex returned `OK` before the alarm fired. The grill was then run directly via `codex exec` (probe proved availability). Workflow-stub report at `curaos-issue-cura-care-oriented-stack-curaos-ai-workspace-373-esign-document-byte-e-0af58dcbe2d1.md` superseded by this file.

## Subject grilled

Proposed scope resolution for #373 given two blocking realities:
1. personal-esign-service + business-esign-service repos are clean-slate shells (only README + .github; last commit "pre-NestJS-rewrite reset") - NOT scaffolded NestJS apps. No overlay module exists to add a byte-embedding tier to.
2. `ai/rules/curaos_triplet_split_rule.md` M11 baseline: "E-Sign: Core-only until a named downstream consumer proves divergent subject ownership." Scaffolding personal/business esign now would violate the triplet-split rule and require touching `curaos/tools/codegen` (handoff FORBIDS).

Proposed: implement the BYTE-FREE verification primitives (PKCS#7 cert-chain path validation + OCSP/CRL revocation + RFC-3161 TSA timestamp verification) in the NEUTRAL CORE (they operate only on the signature artifact + certificates + trust anchors + timestamp token - NO document bytes); defer the byte-DEPENDENT document embedding (PAdES/XAdES via pdf-lib/@signpdf/signpdf/xadesjs) via FORESIGHT until the overlay tier is scaffolded (triplet-split-gated). Libraries: pkijs + @peculiar/x509 (MIT) for chain/OCSP/CRL/RFC-3161; node-forge retained for the existing signing path.

## Reviewer verdict (auto-applied per recommendation rule, 2026-05-29 directive)

1. **Tier for chain/OCSP/CRL/TSA = `esign-core-service`.** RECOMMENDED. These checks are byte-free with respect to DOCUMENT bytes; triplet-split blocks overlay scaffolding; core already owns the detached-signature primitives + verify semantics. AUTO-APPLIED.
2. **"byte-free" glossary** = no DOCUMENT bytes in core. Signature bytes, certs, CRLs, OCSP responses, and TSA tokens are still bytes but are NOT document bytes - they are legitimately byte-free with respect to the PHI/document boundary. AUTO-APPLIED (CONTEXT glossary updated).
3. **API shape:** separate the artifact-validation verdict from the byte-binding (tamper) verdict rather than overloading one boolean. AUTO-APPLIED - new primitive returns a structured `ChainVerificationResult` distinct from the existing `verifyDetachedSignature` hash-binding result; the service surfaces both without removing the existing tamper check.
4. **Trust model:** configurable internal trust-anchor set; do NOT default to ambient public WebPKI; no uncontrolled external AIA/CRL fetch. AUTO-APPLIED - trust anchors are an explicit input; revocation material (OCSP/CRL responses) is supplied to the verifier, parsed offline; live fetch is out of scope for this primitive (the caller/overlay supplies stapled responses), matching the air-gap / self-hosted-first charter.
5. **Revocation behavior:** strict fail-closed mode; revoked => invalid; missing/unreachable revocation material under strict mode => invalid. AUTO-APPLIED.
6. **Overlay byte-embedding + byte-dependent re-hash relocation:** DEFER via FORESIGHT (triplet-split). CONFIRMED.

## Doc conflicts flagged + resolution

- esign-core `Requirements.md` already lists "validate PKCS#7 chain; OCSP/CRL check" as core `verify` behavior (Verification Flow steps 3-4). This MATCHES the plan (we implement the byte-free part of those steps in core). No conflict once "byte-free" is defined as no-document-bytes.
- esign-core `CONTEXT.md` calls chain/OCSP a "deferred verification-tier concern". Reconciled: chain/OCSP/CRL/TSA are byte-free primitives implemented IN core; only document-byte EMBEDDING (PAdES/XAdES) is the deferred overlay-tier concern. CONTEXT updated to draw this line precisely.
- ADR-0205 + m11 research assume personal/business esign exist and that core embeds PDF/XML. STALE on tiering vs the triplet-split rule (higher precedence). Captured as FORESIGHT for an ADR resolution-pin; not patched inline this PR (out of owned paths).

## No genuine user-escalation candidates

Reviewer: "None if recommendation accepted: narrow #373 to byte-free core artifact validation, record byte-dependent verify/embed work as blocked foresight until a byte-owning tier exists." Accepted.
