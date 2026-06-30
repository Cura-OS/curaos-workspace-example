# esign-core-service - Agent Context

**ADR-0205 §3.3** | Neutral core | NestJS (TypeScript) | 2026-05-24

---

## Stack (locked by ADR-0205 + ADR-0100)

| Concern | Choice |
|---|---|
| Runtime | NestJS + Fastify (TypeScript) |
| Primary DB | PostgreSQL 17 (schema-per-tenant, ADR-0101) |
| Blob storage | SeaweedFS (signature bytes; `signature_bytes_ref` key stored in PG) |
| Messaging | Kafka/NATS + outbox (ADR-0102) |
| Auth | Better Auth + Cerbos ABAC (ADR-0120) |
| Tenancy | `@curaos/tenancy` TenantModule (ADR-0155) - mandatory |
| Token validation | JWT Layer 1 (user) + OTP magic-link (external signers) + mTLS Layer 3 (service) per ADR-0156 |
| Audit | Hash-chain PG per ADR-0104 |
| Observability | OTel traces + Grafana (ADR-0107) |
| API spec | TypeSpec → REST |
| Key provider | `SignatureKeyLocalProvider` (default); `SignatureKeyHSMProvider` (future eIDAS QES) |

---

## Dependency Graph

```
esign-core-service
  ──▶ party-service (signer_party_id validation)
  ──▶ PostgreSQL 17 (signature records)
  ──▶ SeaweedFS (detached signature artifacts at rest)
  ──▶ Kafka/NATS (reference-only event publish)
  ──▶ ADR-0120 (Better Auth + Cerbos)
  ──▶ ADR-0155 (@curaos/tenancy)
  ──▶ ADR-0104 (audit hash-chain)

Consumed by:
  business-esign-service (multi-signer orchestration)
  personal-esign-service (individual signing UX)
  business-esign-service ──▶ document-core-service (document-byte access and embedding)
  personal-esign-service ──▶ document-core-service (owner-scoped document-byte access and embedding)
```

No upstream dependency on business-esign or personal-esign.

---

## Key Design Constraints

- **Document-byte boundary.** Neutral esign-core does not fetch, store, persist, or emit document bytes. It stores document references, signing-time SHA-256 hashes, detached signature artifacts, certificates, timestamp/revocation verification material, and audit metadata only. Personal and business overlays own document-core byte access, byte embedding, and retention coordination.
- **Byte-free events.** `esign.signature.*` events carry references, hashes, signer identifiers, status, and verification verdicts only; no document bytes, embedded PDF/XML payloads, or PHI-bearing document content.
- **Permissive-only imports.** `signature_pad`, `pdf-lib`, `@signpdf/signpdf`, `xadesjs` - MIT; `node-forge` - BSD-3-Clause (GPL arm not elected). Any new dependency must be MIT, BSD, or permissive Apache-2.0. Never add AGPL/GPL.
- **Signature bytes NOT in PG.** `signature_bytes_ref` is a SeaweedFS object key. PDF bytes with embedded signature stored in SeaweedFS. PG holds only the reference + metadata.
- **Compatibility path during rollout.** Legacy rows may still carry `signature_pem` inline while backfill uploads them into SeaweedFS. Runtime reads the object-store ref first and falls back to inline PEM only when `ESIGN_SIGNATURE_INLINE_READ_FALLBACK` is not disabled.
- **Revocation does NOT delete bytes.** `status = revoked` only. SeaweedFS object remains for audit retention.
- **Tamper evidence:** hash of document bytes captured at signing time stored in signature record. Verification compares an overlay-supplied live SHA-256 hash with the stored hash; mismatch = tampered.
- **External signer auth:** OTP magic-link token validated by esign-core. Business-esign-service issues the token; esign-core validates it at `/signatures/:id/complete`. Token TTL: 72 hours (configurable per envelope).
- **Certificate storage:** X.509 certificate bytes stored in PG (`certificate_pem` column, not in schema above - add in migration). Fingerprint indexed for quick lookup.

---

## Files Must Not Break

- `db/migrations/esign-core/` - schema; additive changes only.
- `esign.signature.completed` Kafka topic - consumed by business-esign-service (envelope completion) and personal-esign-service (ledger update).
- `SignatureKeyProvider` interface in `@curaos/providers` - interface additions are breaking.
- `POST /signatures/:id/verify` response schema - consumed by business-esign audit trail.

---

## Provider Abstraction (ADR-0154)

- `SignatureKeyProvider` interface, `SIGNATURE_KEY_PROVIDER` DI token.
- `SignatureKeyLocalProvider`: uses `node-forge` to load per-tenant signing key from Vault/OpenBao secret at bootstrap.
- `SignatureKeyHSMProvider`: PKCS#11 path; not implemented for v1; scaffolded as stub.
- Config: `signature_key.provider: local|hsm` per tenant in tenant YAML. Zod validates.

---

## Modulith vs Microservice (ADR-0099 §5)

Same NestJS codebase; runtime flag `CURAOS_DEPLOYMENT_MODE` controls topology. In modulith mode, business-esign and personal-esign call esign-core in-process. In microservice mode, they call via gRPC or Kafka request-reply.

---

## Implementation Notes (#348 - domain landed)

**Signing library choice - `node-forge` (detached PKCS#7/CMS over document hash).**
- esign-core signs a SHA-256 hash supplied by an overlay and produces a detached `SignedData` artifact (`p7.sign({ detached: true })`) that binds that hash. Verification compares the overlay-supplied live hash with the stored signing-time hash, then validates the detached signature artifact (`src/esigns/signing.ts`).
- **License correction (finding):** the installed `node-forge@1.4.0` SPDX is **`(BSD-3-Clause OR GPL-2.0)`**, NOT plain MIT as Requirements.md / AGENTS.md state. We **elect the permissive BSD-3-Clause arm** (GPL is NOT elected), which satisfies the never-AGPL/GPL rule (BSD-3-Clause is permissive, allowed alongside MIT/Apache-2.0). The doc tables should be corrected from "MIT" to "BSD-3-Clause (or GPL-2.0); BSD arm elected" - folded as a doc-accuracy FORESIGHT.
- We do **not** hand-roll signing/hashing primitives; Node `node:crypto` (`createHash`) does SHA-256. `forge.pki` parses X.509 + computes the certificate fingerprint (SHA-256 over DER).
- **Byte-embedding libraries** named in the research (`pdf-lib`, `@signpdf/signpdf`, `signature_pad`, `xadesjs`) operate on document bytes and UI capture; they belong to the overlay/document tier that owns the blob, not this neutral core. Their integration is FORESIGHT (see below). They were intentionally not added to `package.json`; adding them to the neutral core would pull document-byte handling across the PHI/blob boundary.

**Hash-chain audit reuse.** Every lifecycle transition (initiated/sent/completed/declined/voided/verified/revoked) appends a tamper-evident entry via the scaffold's `EsignAuditPublisher` + `AuditChainHeadStore` (`src/audit/`), chaining under `(tenantId, 'SigningRequest', requestId)`. The full-envelope `auditChainHash` (#300) binds actor/action/outcome - recompute-verified in `test/esigns.audit-chain.test.ts`. No new chain primitive was invented.

**Event routing - durable DOMAIN outbox.** `esign.signature.*` events (`src/events/signing-events.ts`) are enqueued via `DomainOutboxService.enqueue(...)` (the scaffolded `domain_outbox` durable table + post-commit relay). Topics: `curaos.core.esign.signature.{initiated,sent,completed,declined,voided,verified,revoked}.v1`. Partition key = sha256(tenant, signing_request_id); idempotency key = event_id. Reference-only payloads (doc hash + fingerprint, never bytes/PHI).

**Domain tables (migrations `0003_signing_domain.sql` + `0004_signature_artifact_ref.sql`).** `signing_request` (lifecycle aggregate + document reference + hash baseline) + `signature` (SeaweedFS `signature_bytes_ref`, legacy nullable `signature_pem`, cert fingerprint, status; revoke flips status, never deletes). `PostgresSigningStore` is idempotent on `(tenant, document, signer)` for create + `(tenant, request)` for the signature.

**Key provider (ADR-0154).** `SignatureKeyProvider` (`SIGNATURE_KEY_PROVIDER` token) with `SignatureKeyLocalProvider` (per-tenant PEM, composition-root wired; empty-map default fails closed) + `SignatureKeyHsmProvider` stub (PKCS#11 / eIDAS QES - throws until wired). Controllers/services never touch key bytes directly.

**Artifact provider seam (issue #370).** `SIGNATURE_ARTIFACT_STORE` resolves either `InMemorySignatureArtifactStore` (tests / standalone) or `SeaweedFsSignatureArtifactStore` (S3-compatible `@aws-sdk/client-s3`, path-style). Composition-root env: `ESIGN_SIGNATURE_ARTIFACT_PROVIDER=in-memory|seaweedfs`, `ESIGN_SIGNATURE_ARTIFACT_BUCKET`/`SEAWEEDFS_BUCKET`, `SEAWEEDFS_S3_ENDPOINT`, `SEAWEEDFS_ACCESS_KEY`, `SEAWEEDFS_SECRET_KEY`, optional `ESIGN_SIGNATURE_ARTIFACT_KEY_PREFIX`. Optional boot backfill: `ESIGN_SIGNATURE_ARTIFACT_BACKFILL_ON_BOOT=true`.

**Byte-free verification pipeline (#373 - LANDED).** `src/esigns/verification.ts` adds two byte-free primitives that verify a legally-meaningful signature WITHOUT touching document bytes (they operate on the signature artifact + certs + an explicit trust-anchor set + supplied revocation material + the RFC-3161 token):
- `verifyCertificateChain({ certificatePems, trustAnchorPems, crlsDer?, ocspResponsesDer?, checkDate?, strict? })` → RFC 5280 chain path validation (`pkijs.CertificateChainValidationEngine`) + leaf revocation via supplied CRL (`isCertificateRevoked`) / OCSP (`getCertificateStatus`). Chain-path and revocation are SEPARATE verdicts (the engine demands full-chain revocation coverage, so revocation is checked per-leaf outside the engine). Fails closed: empty trust-anchor set, broken chain, revoked leaf, and (under `strict`) missing revocation material.
- `verifyTimestampToken({ timestampTokenDer, expectedImprintSha256Hex, tsaTrustAnchorPems?, checkDate? })` → RFC-3161 token verification: imprint match + genTime-within-TSA-cert-validity (the expiry gate) + TSA SignedData signature when anchors supplied. Fails closed on imprint mismatch, expired/out-of-window genTime, or bad TSA signature.
- Libraries: `pkijs@3.4.0` + `@peculiar/x509@2.0.0` + `asn1js@3.0.10` (all MIT; pure-JS over Node WebCrypto, offline/air-gap-safe). `node-forge` unchanged on the signing path. Trust anchors are explicit (never ambient/public WebPKI); revocation material is SUPPLIED/stapled (no uncontrolled outbound fetch). Research: `ai/curaos/docs/research/2026-06-08-esign-verification-pipeline-pkcs7-ocsp-crl-tsa.md`. Grill: `ai/curaos/docs/grills/m12-373-esign-verification-pipeline.md`.
- These are exported from the barrel as the core's byte-free verification output; the overlay tier will consume them once it exists. The HTTP `verify()` contract is unchanged (additive primitives, not a new request shape this PR).

**FORESIGHT (deferred - fold into mold / overlay):**
- `kind:foresight` / milestone **M12+ (overlay/GA)** / scope **document-byte-embedding tier**: integrate `pdf-lib` + `@signpdf/signpdf` (PAdES-B-B embed) + `xadesjs` (XAdES-BES) + `signature_pad` (wet capture) in personal/business overlays once triplet split is justified. esign-core remains the owner of detached signature artifacts, signing-time hashes, byte-free verification primitives, and verification verdicts.
- `kind:foresight` / milestone **M12+** / scope **verification HTTP surface + live revocation fetcher**: wire `verifyCertificateChain` / `verifyTimestampToken` into the `POST /signatures/:id/verify` response as additive verdict fields (needs trust-anchor config + supplied revocation/timestamp material in the request/record), plus an optional deployment-aware, allowlisted live OCSP/CRL/TSA fetcher (this primitive is stapled-response/offline only).
- `kind:foresight` / milestone **M12+** / scope **ADR-0205 resolution-pin**: ADR-0205 is pinned by curaos-ai-workspace#674 to keep document-byte embedding in personal/business overlays and byte-free detached verification in esign-core.

## Test Requirements

- Unit: detached signature artifact creation, certificate-chain verification, timestamp-token verification, and OCSP/CRL mock response handling.
- Integration: overlay computes document hash, core stores detached artifact and reference-only metadata, verification consumes the supplied live hash and verification material.
- Boundary: neutral persistence and `esign.signature.*` events contain no document bytes or embedded PDF/XML payloads.
- Tamper detection: overlay mutates document bytes after signing, supplies the new live hash, and `verify` returns invalid.
- Revocation: revoke, re-verify, and still return `valid: false` (revocation check in OCSP mock).
- Audit: every sign/verify/revoke emits hash-chain entry; chain integrity verified.
