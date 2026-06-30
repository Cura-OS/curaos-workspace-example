# ADR-0108 — Security & Secrets Stack

> **✅ ACCEPTED WITH ADDENDUM** — per [ADR-0150](0150-baseline-alignment-rules.md) §3: Tink JVM → `jose` (pure ESM) for NestJS host crypto; OR Tink Node binding when needed. OpenBao + Opengrep + SonarQube + Trivy + Coraza + Falco + Tetragon + cert-manager + Wazuh all stand. Local + 3rd-party rule applies (HashiCorp Vault Cloud / AWS Secrets Manager as 3rd-party).


| Field | Value |
|---|---|
| ID | 0108 |
| Status | Accepted |
| Date | 2026-05-24 |
| Authors | Platform Security Team |
| Reviewers | Architecture Guild |
| Supersedes | — |
| Superseded by | — |

---

## 1. Context

CuraOS is a composable SaaS + on-prem + air-gap platform built from 91 Kotlin + Spring Boot microservices, a React / Flutter / Astro frontend, and the following already-decided infrastructure:

- **Data:** PostgreSQL 17 (primary store), Valkey (cache/session), SeaweedFS with WORM (object/blob)
- **Messaging:** Kafka (durable events), NATS (lightweight pub/sub)
- **Gateway:** Apache APISIX (API gateway + routing)
- **Identity & AuthZ:** Keycloak 26 (OIDC/SAML), OPA (policy engine), SpiceDB (relationship/ReBAC)
- **Audit:** Hash-chained immutable audit log in PostgreSQL
- **Workflow:** Flowable (human tasks / BPM), Temporal (durable execution)
- **Storage encryption:** SeaweedFS WORM volumes with at-rest encryption enabled

**Regulatory scope:** HIPAA Security Rule (2025 revision — all specifications now mandatory, 240-day window after May 2026 finalization), GDPR, OWASP ASVS Level 2.

**Key 2025-HIPAA mandatory additions** (previously "addressable"):
- Encryption of ePHI at rest and in transit — now required, limited documented exceptions only
- MFA for all systems accessing ePHI
- Vulnerability scanning ≥ every 6 months, penetration testing annually
- Technology asset inventory reviewed annually
- Network mapping of ePHI data flows
- Security incident response and restoration within 72 hours
- Business associate notification within 24 hours of contingency plan activation

**Deployment models** requiring identical security posture:
1. Cloud SaaS (multi-tenant, horizontal scale)
2. On-prem single-tenant (customer infra, no internet egress assumed)
3. Hybrid (vendor control plane + customer data plane)
4. Air-gap / home-lab (no external calls, offline artifact registry)

**What was not yet decided:** secrets management product, encryption key management, SAST/DAST/SBOM toolchain, secret scanning, container image scanning, WAF/DDoS, TLS / PKI, runtime threat detection, cryptographic primitives for PHI field-level encryption, pre-commit hooks, and vulnerability disclosure + SBOM publication.

This ADR resolves all fifteen sub-decisions.

---

## 2. Decision Drivers

1. **Self-hosted and air-gap first.** Every component must operate without external network access. Cloud-managed services are allowed as opt-in overlays only.
2. **License alignment for SaaS.** Components embedded in the product must carry licenses permitting commercial distribution without revenue-sharing or competition clauses. BUSL 1.1, Commons Clause, and proprietary licenses are blocked for core components.
3. **HIPAA + GDPR + OWASP ASVS L2.** All required controls must map to named product decisions.
4. **Operational simplicity.** A small platform team operates this. Preference for tools that consolidate scope rather than multiply agents.
5. **Supply-chain verifiability.** SBOM publication and SLSA provenance are strategic commitments; toolchain must make them cheap.
6. **Cost predictability.** Open-source first. Commercial tiers allowed only where open-source has material functional gaps.

---

## 3. Options Considered

### 3.1 Secrets Manager

| Option | License | Air-gap | Self-hosted HA | Notes |
|---|---|---|---|---|
| **HashiCorp Vault Community** | BUSL 1.1 | Yes | Raft HA | IBM-owned since Feb 2025; competition clause blocks SaaS embedding |
| **OpenBao 2.5** | MPL 2.0 | Yes | Raft HA | Linux Foundation / OpenSSF sandbox; GitLab production; v2.3 added namespaces (Jun 2025); v2.5 standby read scaling (Feb 2026) |
| **Infisical** | MIT (core) | Yes (limited) | PostgreSQL + Redis | Dynamic secrets still maturing; simpler ops; air-gap static JWKS supported |
| **SOPS + age** | MPL 2.0 | Yes | Git-native | File-level encryption only; not a runtime secrets API; no dynamic credentials |
| **External Secrets Operator** | Apache 2.0 | Depends on backend | K8s-native | Aggregation layer over other backends; not a standalone store |
| **Cloud KMS** (AWS/GCP/Azure) | Proprietary managed | No | Managed | Violates self-hosted constraint for core |

**Rejected:**
- HashiCorp Vault Community: BUSL 1.1 prohibits embedding in a competing SaaS product; IBM ownership introduces future licensing risk.
- Infisical: Dynamic secrets still in active development; gaps in credential rotation for 91 services; chosen as future secondary UI for developer-friendly secret viewing after OpenBao stabilizes.
- SOPS + age: Complementary tool (see §3.2 and §3.14), not a runtime API-driven secrets manager.
- Cloud KMS: Violates self-hosted first.
- External Secrets Operator: Retained as the K8s-native bridge to OpenBao (see §4.1).

### 3.2 Encryption Key Management

| Option | Air-gap | FIPS option | Dynamic rotation | Notes |
|---|---|---|---|---|
| **OpenBao Transit engine** | Yes | No certified build (MPL 2.0 build) | Yes | AES-256-GCM96, ChaCha20-Poly1305, ECDSA, Ed25519; BYOK; auto-rotation; free in OpenBao (Vault Enterprise feature) |
| **HashiCorp Vault Transit** | Yes | FIPS 140-3 builds (Enterprise) | Yes | Enterprise cost; BUSL licensing |
| **age (file encryption)** | Yes | No | Manual | Suitable for GitOps secrets-at-rest (SOPS); not a runtime KMS |
| **Cloud KMS** | No | Yes (most providers) | Yes | Violates constraint |
| **HSM (hardware)** | Yes | FIPS 140-2/3 | Yes | High cost; required for FIPS-regulated deployments only |

**Note on FIPS:** 2025 HIPAA does not mandate FIPS 140 validated modules for non-federal covered entities. If a future federal contract requires FIPS 140-3, the migration path is to Vault Enterprise FIPS builds or an HSM front-end for OpenBao via PKCS#11 auto-unseal (OpenBao v2.2+).

### 3.3 SAST

| Option | License | Kotlin support | CI integration | Notes |
|---|---|---|---|---|
| **Semgrep CE (Community Edition)** | Engine: LGPL 2.1; Rules: Semgrep Rules License v1.0 (Dec 2024) | Yes (JVM rules) | GitHub Actions, GitLab, Jenkins | Rules license restricts competing SaaS use; internal use unaffected |
| **Opengrep** | MPL 2.0 (forked from Semgrep Dec 2024) | Yes | CLI, GitHub Actions | Coalition fork (Aikido, Endor Labs, Kodem, etc.); rule compatibility maintained; production-ready as of early 2025 |
| **SonarQube Community** | LGPL 3.0 | Kotlin first-class | CI webhook | Server process required; strong Kotlin/Spring support; free community edition |
| **CodeQL** | MIT (engine); BSD (queries) | Yes | GitHub Actions native | Best for GitHub-hosted repos; local runner possible but complex; deep call-graph analysis |
| **Semgrep Pro / Snyk Code** | Commercial | Yes | SaaS-first | Not evaluated further; cost and SaaS dependency |
| **Checkmarx** | Commercial | Yes | Enterprise | Not evaluated |

**Rejected:**
- Semgrep CE: Rules License v1.0 restricts use in SaaS products that compete with Semgrep's own offering; creates legal ambiguity for CuraOS AppSec features.
- Commercial-only: budget and licensing constraints.

### 3.4 DAST

| Option | License | CI/CD automation | API scanning | Notes |
|---|---|---|---|---|
| **OWASP ZAP** | Apache 2.0 | Docker-based CI, GitHub Actions | OpenAPI import, REST, GraphQL | Moved to Software Security Project (SSP) 2023; core team joined Checkmarx 2024; remains fully open source; crawling + fuzzing for unknown vulns |
| **Nuclei** | MIT | CLI, GitHub Actions, SARIF | Template-driven (12,000+ templates) | No crawling; targets known CVEs + misconfigs; ~0 false positives; 1–5 min scans |
| **Burp Suite Community** | Proprietary (free tier) | Manual only (no CI in free) | Yes | Pro/Enterprise required for automation; $449–$8,999+/year |
| **Wapiti** | GPL 2.0 | CLI only | REST partial | Limited ecosystem |
| **StackHawk** | Commercial SaaS | Yes | OpenAPI | SaaS dependency |

**Rejected:**
- Burp Community: No CI automation without paid license.
- Wapiti: Sparse ecosystem, no SARIF output.
- StackHawk: SaaS dependency.

### 3.5 SBOM + Dependency Scanning

| Option | License | SBOM formats | Language coverage | Continuous monitoring | Notes |
|---|---|---|---|---|---|
| **Trivy** | Apache 2.0 | CycloneDX, SPDX (generate + consume) | 20+ ecosystems, containers, IaC | Kubernetes Operator | All-in-one: vulns, IaC misconfig, secrets, licenses |
| **Syft + Grype** | Apache 2.0 | CycloneDX, SPDX, Syft JSON | 20+ ecosystems | No K8s operator | Modular; Grype adds EPSS + KEV composite risk score; better for SBOM-first pipeline |
| **Dependency-Track** | Apache 2.0 | CycloneDX native | Via SBOM import | Yes (continuous) | OWASP project; SBOM ingestion + policy engine + continuous re-analysis as NVD updates; EPSS integration; 3.6k stars; reference platform in OWASP Top 10:2025 A03 |
| **OSV-Scanner** | Apache 2.0 | SPDX partial | 12+ | No | Google project; fast; fewer false positives via OSV DB |
| **Snyk Open Source** | Commercial | Yes | Yes | Yes | SaaS dependency; cost |

**Rejected:**
- Snyk Open Source: SaaS dependency, cost at 91-service scale.

### 3.6 Secret Scanning

| Option | License | Pre-commit | CI/CD | Verified detection | Notes |
|---|---|---|---|---|---|
| **Gitleaks** | MIT | Yes (millisecond) | Yes | No (pattern-match only) | 150+ regex patterns; fastest pre-commit feedback; already in use |
| **TruffleHog** | AGPL 3.0 | Slower | Yes | Yes (live credential verification) | 800+ secret types; verifies active keys via provider API; better CI/CD depth scan |
| **detect-secrets** | Apache 2.0 | Yes | Yes | No | Yelp project; allowlist management |
| **Talisman** | MIT | Yes | No | No | Thoughtworks; pre-commit only; less maintained |

**Note on AGPL 3.0:** TruffleHog's AGPL license does not restrict running it as a CI tool against your own code. AGPL applies to distribution of TruffleHog itself or using it to provide a scanning service to third parties.

### 3.7 Container Image Scanning

| Option | License | SBOM generation | K8s integration | Notes |
|---|---|---|---|---|
| **Trivy** | Apache 2.0 | Yes (CycloneDX, SPDX) | Operator available | Covers OS + language packages; IaC; secrets; license compliance |
| **Grype** | Apache 2.0 | Via Syft | No native operator | EPSS + KEV risk scoring; SBOM-centric |
| **Clair** | Apache 2.0 | No | Via ClairCore | CoreOS/RedHat project; primarily OS-level vulns; less active |
| **Dockle** | Apache 2.0 | No | No | CIS Docker Benchmark linting only; complementary not primary |
| **Snyk Container** | Commercial | Yes | Yes | SaaS dependency |

**Rejected:**
- Clair: Less active development; narrower scope; no SBOM generation.
- Snyk Container: SaaS dependency.
- Dockle: Linter only, not a scanner.

### 3.8 WAF + DDoS

| Option | License | APISIX integration | CRS support | Air-gap | Notes |
|---|---|---|---|---|---|
| **Coraza WAF** | Apache 2.0 | Yes (proxy-wasm plugin) | 100% CRS test suite pass | Yes | Go implementation; no C deps; embeds in APISIX via proxy-wasm; memory-safe; OWASP project |
| **ModSecurity (CRS)** | Apache 2.0 | Nginx module; not native APISIX | Yes | Yes | C-based; APISIX requires Nginx module path or fork; Coraza is the recommended forward path for APISIX |
| **CrowdSec** | MIT (agent) | Bouncer plugin | Behavioral (not CRS) | Partial (telemetry optional) | Collaborative IP reputation; behavioral detection; complements WAF; not a WAF replacement |
| **SafeLine** | Commercial (open-core) | Yes (plugin) | Partial | Yes | Chinese vendor; limited western ecosystem documentation |
| **Cloud WAF** (CloudFlare, AWS WAF) | Proprietary managed | No direct APISIX integration | Varies | No | Violates self-hosted constraint for on-prem |

**Rejected:**
- ModSecurity: APISIX uses proxy-wasm; Coraza is the native implementation; ModSecurity's C dependency makes air-gap container builds heavier.
- SafeLine: Limited ecosystem documentation and vendor transparency for regulated deployments.
- Cloud WAF: Violates self-hosted first.

### 3.9 TLS + Certificate Management

| Option | Air-gap | Wildcard/internal CA | Auto-renewal | ACME | Notes |
|---|---|---|---|---|---|
| **cert-manager + Let's Encrypt** | No (LE requires internet) | Via internal issuer | Yes | Yes | Best for internet-facing; internal issuers (CA, Vault/OpenBao) work for air-gap |
| **cert-manager + OpenBao PKI** | Yes | Yes | Yes | Via step-ca issuer | cert-manager as K8s controller; OpenBao PKI engine as CA backend; unified lifecycle |
| **step-ca (Smallstep)** | Yes | Yes | Yes (ACME) | Yes (self-hosted) | Open source; supports K8s cert-manager via step-issuer; ACME server for air-gap |
| **Internal CA only (manual)** | Yes | Yes | Manual | No | Not viable at 91-service scale |
| **OpenBao PKI engine standalone** | Yes | Yes | Yes | Via integration | No K8s-native controller without cert-manager bridge |

### 3.10 Runtime Threat Detection

| Option | License | eBPF | K8s-native | Multi-tenant | Enforcement | Notes |
|---|---|---|---|---|---|---|
| **Falco** | Apache 2.0 | Yes (eBPF driver) | Yes | Partial (manual label filtering) | Detect only | CNCF graduated; 5–10% overhead; strongest ecosystem; cluster-wide alerts |
| **Tetragon** | Apache 2.0 | Yes (eBPF kernel-level) | Yes (label-aware) | Strong (namespace/pod-aware policies) | Detect + enforce | Cilium project; <1% overhead; policy enforcement in kernel; better multi-tenant isolation |
| **Aqua Tracee** | Apache 2.0 | Yes | Yes | Partial | Detect | Aqua-backed; good forensics; requires Aqua ecosystem for full value |
| **Sysdig** | Commercial | Yes | Yes | Yes | Commercial | Paid; not evaluated further |
| **Wazuh** | GPL 2.0 | No (agent-based) | Partial (DaemonSet) | Via agent config | SIEM + IDS | Broad scope: SIEM, FIM, log analysis, IDS, compliance; complements eBPF tools; not a replacement |

### 3.11 Compliance Frameworks

Covered in §6 (HIPAA mapping), §7 (GDPR), §8 (OWASP ASVS L2), §9 (SOC 2 / ISO 27001).

### 3.12 Penetration Testing Approach

| Approach | Tooling | Cadence | Notes |
|---|---|---|---|
| Continuous automated | ZAP + Nuclei in CI/CD | Every PR + nightly | Catches regressions early; low finding quality for business logic |
| Periodic manual | External pen-test firm | Annual minimum (HIPAA 2025) | Required by updated HIPAA; tests auth chains, IDOR, business logic |
| Hybrid | Both | Automated continuous + annual manual | Chosen approach |

### 3.13 Cryptographic Primitives

| Decision area | Option A | Option B | Option C |
|---|---|---|---|
| PHI field-level encryption | **Google Tink (tink-java 1.21+)** | Bouncy Castle FIPS (BC-FJA 2.1.2) | JCE (javax.crypto) |
| Argon2id pepper management | OpenBao KV + Transit | Env-injected at boot | HSM |
| PG17 TDE | pg_tde extension | Encrypted tablespace (manual) | — |

**Google Tink:** maintained by Google security engineers; AEAD-first API prevents misuse; Java 11+; FIPS 140-2 mode available (uses BoringSSL under hood for FIPS builds); recommended explicitly for HIPAA field-level encryption by multiple security engineering teams; tink-java 1.21.0 current; tink-java-gcpkms 1.10.0 for GCP KMS integration (optional, not required for self-hosted).

**Bouncy Castle FIPS (BC-FJA 2.1.2):** certified for Java 8/11/17/21 (Certificate #4943); patch releases now published under FedRAMP update stream model; 3.0.0 adds ML-KEM/ML-DSA/SLH-DSA (post-quantum, in early access); CVE-2025-12194 (GC overrun on JDK 17/21) patched in 2.1.2. Retained as **optional FIPS overlay** for federal contract scenarios.

**JCE:** rejected — raw JCE requires cryptographic expertise to avoid misuse (IV reuse, padding oracle); Tink's opinionated API eliminates whole classes of bugs.

### 3.14 Pre-commit Hooks

| Tool | Purpose | Speed | Notes |
|---|---|---|---|
| Gitleaks | Secret scanning | Milliseconds | Already in use; retained |
| TruffleHog | Deep secret + credential verification | Minutes (CI only) | CI-stage only; not pre-commit |
| Opengrep | SAST pattern matching | Seconds | Replaces Semgrep CE in pre-commit |
| ktlint / detekt | Kotlin style + static analysis | Seconds | Per-service; enforced in pre-commit |
| Trivy (fs mode) | Dependency vuln scan | 10–30 seconds | Lightweight fs scan pre-push; full scan in CI |

### 3.15 Vulnerability Disclosure + SBOM Publication

| Practice | Tool | Notes |
|---|---|---|
| SBOM generation | Trivy (CycloneDX) per image | Generated in CI, published to artifact registry |
| SBOM continuous monitoring | Dependency-Track | Ingests SBOMs; re-analyzes as NVD/OSV updates; EPSS prioritization |
| CVE disclosure | security.txt + GitHub Security Advisories | OWASP Top 10:2025 A03 recommendation |
| SLSA provenance | GitHub Actions attestation | SLSA Build L2 target |
| Responsible disclosure | security.txt at /.well-known/security.txt | 90-day coordinated disclosure window |

---

## 4. Decisions

### 4.1 Secrets Manager: OpenBao 2.5 + External Secrets Operator

**Decision:** OpenBao 2.5 as the secrets management core. External Secrets Operator (ESO) as the Kubernetes-native bridge between OpenBao and workload pods.

**Rationale:**
- MPL 2.0 license; no competition clause; safe to embed in CuraOS as a product.
- Linux Foundation / OpenSSF governance; IBM-independent.
- v2.3 (Jun 2025): namespaces for multi-tenant isolation between overlay verticals (HealthStack vs EduStack vs neutral).
- v2.2 (Mar 2025): PKCS#11/HSM auto-unseal — required for regulated on-prem deployments.
- v2.5 (Feb 2025): standby-node read scaling for high-availability SaaS profile.
- Storage backends: Raft (integrated, preferred) + PostgreSQL (for sites already running PG17 without separate Raft cluster).
- Transform secrets engine (tokenization, masking, format-preserving encryption) included free — this is a Vault Enterprise feature costing $$$.
- Transit engine provides runtime encryption-as-a-service for PHI fields (see §4.2).
- Enterprise support available from Adfinis (Secretz, CHF 2,500–6,000/month) and ControlPlane (since Mar 2026) for on-prem customers requiring SLAs.
- Air-gap: fully supported; no external calls; offline artifact bundles.
- SOPS + age used **alongside** OpenBao for GitOps secrets-at-rest in Helm values and K8s manifests (encrypts values, keys in git, plaintext structure visible in diffs). This is complementary, not competing.

**ESO role:** ESO watches OpenBao paths and syncs secrets into Kubernetes `Secret` objects on a configurable schedule. Eliminates the Vault Agent Injector sidecar pattern. Fewer attack surface components per pod.

**Deployment topology:**
```
[ OpenBao Cluster (3 nodes, Raft) ]
    ├── Transit engine   → field-level encryption API (PHI)
    ├── PKI engine       → intermediate CA for service TLS certs
    ├── KV v2 engine     → static secrets, API keys, DB passwords
    ├── Database engine  → dynamic PostgreSQL/Valkey credentials
    ├── K8s auth method  → workload identity (ServiceAccount JWT)
    └── Namespaces       → healthstack/, educationstack/, neutral/
          (multi-tenant isolation per overlay)

[ External Secrets Operator ]
    └── SecretStore → OpenBao KV
    └── ExternalSecret → syncs to K8s Secret per service
```

**Migration note:** Starting from Vault 1.14.1 Community (if any existing install): snapshot restore supported. From Vault 1.15+ or Enterprise: API-driven re-import required.

### 4.2 Encryption Key Management: OpenBao Transit Engine

**Decision:** OpenBao Transit engine as the primary key management and encryption-as-a-service layer.

**Supported key types in use:**
- `aes256-gcm96` — symmetric encryption for PHI field-level (default)
- `chacha20-poly1305` — alternative for constrained environments
- `ecdsa-p384` — signing (audit chain, document signatures)
- `ed25519` — signing (SLSA provenance, internal tokens)

**Key rotation:** automatic rotation via `min_decryption_version` + `min_encryption_version` policy; rewrap job runs on a 90-day schedule.

**BYOK:** Import path available for customers with existing HSM-managed keys (PKCS#11 unsealing + BYOK import).

**FIPS path:** If a federal contract mandates FIPS 140-3: introduce a PKCS#11-backed HSM (nShield or SoftHSM for dev) for the unseal key; application-layer encryption remains Tink (FIPS 140-2 via BoringSSL) or BC-FJA 2.1.2 (NIST Certificate #4943). No application code changes required for the transit upgrade path.

**PHI field-level encryption (application layer):** Google Tink (`tink-java` 1.21+). Reasons:
- AEAD-first API; impossible to call encrypt() without authentication tag.
- KeysetHandle abstraction stores wrapped DEKs; master key lives in OpenBao Transit.
- Deterministic AEAD (`AesSivKeyManager`) for searchable encrypted fields (e.g., MRN lookup without decryption).
- Java 11+ supported; fits Spring Boot services with zero JCE boilerplate.
- No Google Cloud dependency; local keysets with OpenBao-backed KEK (Key Encryption Key).

**Envelope encryption pattern:**
```
PHI field value
  → Tink AEAD (DEK: AES-256-GCM, stored as encrypted keyset)
  → DEK wrapped by OpenBao Transit KEK (per-tenant key)
  → KEK stored in OpenBao, auto-rotates every 90 days
  → Audit log entry in hash-chained PG table on every key usage
```

**PG17 TDE:** Enable `pg_tde` extension for tablespace-level encryption. Key reference: OpenBao Transit; `pg_tde` fetches key via Transit API at startup. Covers data files + WAL on disk; complement to field-level Tink encryption (defense in depth).

### 4.3 SAST: Opengrep (primary) + SonarQube Community (secondary)

**Decision:** Opengrep as the primary lightweight SAST runner in CI and pre-commit. SonarQube Community Edition as the secondary deep-analysis server for scheduled full-codebase scans.

**Opengrep:**
- MPL 2.0 (forked from Semgrep Dec 2024 in response to Semgrep Rules License v1.0 change).
- Coalition-backed: Aikido Security, Endor Labs, Kodem, Legit Security, Mobb, Orca Security.
- Full rule compatibility with Semgrep CE rules (LGPL 2.1 rule set); Semgrep Rules License rules excluded.
- Use in pre-commit (fast incremental scan on changed files) and PR gate (full scan on diff).
- Kotlin JVM rules available via community rule packs.

**Why not Semgrep CE:** The Semgrep Rules License v1.0 (Dec 2024) restricts use of Semgrep-maintained rules in SaaS products competing with Semgrep's AppSec platform. CuraOS is a platform; legal ambiguity is unacceptable. Internal use is technically permitted but the competitive-use restriction creates procurement friction for commercial customers running CuraOS.

**SonarQube Community:**
- LGPL 3.0; self-hosted.
- Kotlin + Spring Boot first-class support (Spring Security rule set, injection detection).
- Cyclomatic complexity, cognitive complexity, duplication, coverage gate integration.
- Run on nightly schedule against full codebase; results surface in developer dashboard.
- Quality gate: block merges on new blocker/critical findings in changed files.

**CodeQL** (GitHub Actions): retained as optional secondary scanner for GitHub-hosted services where deeper call-graph analysis is needed (e.g., deserialization gadget chains in Spring services). Not mandated for all 91 services; enabled per-service based on threat model.

### 4.4 DAST: ZAP baseline + Nuclei targeted

**Decision:** Two-tool complementary pipeline. OWASP ZAP for crawling + fuzzing; Nuclei for known CVE + misconfiguration templates.

**ZAP (Zed Attack Proxy):**
- Apache 2.0; maintained by Software Security Project (SSP) since 2023; core team at Checkmarx; fully open source.
- Docker-based CI integration: `zap-baseline.py` on every PR (2–5 min); `zap-full-scan.py` nightly.
- OpenAPI spec import for structured API scanning (all 91 services expose OpenAPI via APISIX).
- Output: SARIF → GitHub Code Scanning / GitLab Security Dashboard.
- Crawls and fuzzes for unknown application-specific vulnerabilities; required for OWASP ASVS L2 dynamic testing.

**Nuclei:**
- MIT; 12,000+ community templates; ~0% false positive rate on template-based checks.
- Targets known CVEs, misconfigurations, exposed panels, OIDC misconfiguration.
- 1–5 min per staging deploy; complements ZAP with pattern accuracy.
- SARIF output; GitHub Actions integration.

**Pipeline layout:**
```
PR open       → ZAP baseline (2-5 min) + Opengrep SAST
Staging deploy → ZAP full scan (30-60 min) + Nuclei templates
Nightly       → ZAP active scan on all service endpoints
Annual        → Manual penetration test (external firm, HIPAA 2025 §164.308(a)(8))
```

**Burp Suite Professional:** recommended for annual manual penetration testing engagements (external firm brings their own license). Not included in platform toolchain.

### 4.5 SBOM + Dependency Scanning: Trivy + Dependency-Track

**Decision:** Trivy for SBOM generation and container/dependency scanning; Dependency-Track for continuous SBOM monitoring.

**Trivy (primary scanner):**
- Apache 2.0; single binary.
- Generates CycloneDX and SPDX SBOMs during CI image builds.
- Scans: OS packages, language ecosystems (JVM/Gradle/Maven, JS, Go, Python), IaC misconfigurations, embedded secrets, license compliance.
- Kubernetes Operator for continuous cluster assessment post-deploy.
- Replaces the need for separate IaC scanner (Checkov) and license scanner.
- `trivy image --format cyclonedx --output sbom.json <image>` → artifact registry publish.

**Dependency-Track (continuous monitoring):**
- Apache 2.0; OWASP project; 3.6k GitHub stars.
- Ingests CycloneDX SBOMs pushed from CI; re-analyzes as NVD / OSV / GitHub Advisories / Sonatype OSS Index update.
- EPSS integration for exploit probability prioritization.
- Policy engine: block deploy if CVSS ≥ 9.0 and EPSS > 0.5 (high-severity, actively exploited).
- REST API for programmatic policy enforcement in CD pipeline.
- OWASP recommended reference platform for SBOM-based vulnerability management (Top 10:2025 A03).
- Self-hosted; PostgreSQL backend; air-gap: offline NVD mirror supported.

**Syft + Grype** retained as optional secondary pipeline for services requiring EPSS + KEV composite risk scoring without Dependency-Track overhead. Especially useful for ad-hoc triage and developer workstation scans.

### 4.6 Secret Scanning: Gitleaks (pre-commit) + TruffleHog (CI)

**Decision:** Dual-layer approach. Gitleaks pre-commit for speed; TruffleHog in CI for depth and credential verification.

**Gitleaks:**
- MIT; already in use; retained as pre-commit hook.
- 150+ regex patterns; sub-second feedback on commit.
- Blocks commits with detected secrets before they enter git history.
- Configuration: `.gitleaks.toml` per repository with custom allowlist rules.

**TruffleHog:**
- AGPL 3.0; CI-stage use (running against your own repo) is not distribution; AGPL restriction does not apply.
- 800+ credential types; live verification via provider APIs.
- Runs on every push to `main` and `release/*` branches; scans full git history on initial setup.
- Output: structured JSON → security incident queue.
- Combined with Gitleaks: any pattern Gitleaks misses at commit time, TruffleHog catches with verified confirmation in CI.

**detect-secrets:** retained for allowlist management on legacy secrets identified during TruffleHog history scan. Not a primary scanner.

### 4.7 Container Image Scanning: Trivy

**Decision:** Trivy (already selected in §4.5) serves double duty as the container image scanner.

**Scan targets:**
- Every image built in CI: `trivy image --severity HIGH,CRITICAL`
- Every image in the K8s cluster: Trivy Kubernetes Operator continuous scan
- Base images: weekly rescan even if source unchanged (new CVEs against pinned images)

**Policy enforcement:**
- Block deployment if CRITICAL CVE with EPSS > 0.4 and KEV listed.
- Warn (non-blocking) on HIGH severity; engineering team triages within 5 business days.
- HIPAA 2025: vulnerability scan results retained for audit; Dependency-Track records every scan result.

**Dockle** retained as a supplementary CIS Docker Benchmark linter for Dockerfile best-practice enforcement (not a vulnerability scanner; run in PR pipeline on Dockerfile changes).

### 4.8 WAF + DDoS: Coraza WAF (APISIX proxy-wasm) + CrowdSec

**Decision:** Coraza WAF with OWASP CRS via APISIX proxy-wasm plugin. CrowdSec as the behavioral IP reputation layer.

**Coraza WAF:**
- Apache 2.0; OWASP project; Go implementation; no C dependencies.
- APISIX has native `proxy-wasm` integration; Coraza Proxy Wasm runs as a filter in the APISIX data plane.
- Passes 100% of OWASP CRS test suite.
- Memory-safe; no ModSecurity C library compilation required in air-gap container builds.
- CRS ruleset pinned in Git; CI validates against CRS test suite on every ruleset update.
- Paranoia level: start at PL1 for production; increase with tuning per tenant.
- Custom rules: per-vertical (HealthStack FHIR endpoints get stricter rules on PHI parameters).

**Why not ModSecurity:** ModSecurity requires C library + Nginx module; does not integrate natively with APISIX proxy-wasm; Coraza is the OWASP-recommended forward path for Go/Wasm environments.

**CrowdSec:**
- MIT (agent); collaborative IP reputation; behavioral detection.
- Deployed as a separate agent reading APISIX access logs; decisions fed back via APISIX `ip-restriction` plugin or CrowdSec's own bouncer.
- Community threat intelligence sharing optional (disabled in air-gap); local-only mode fully supported.
- Complements Coraza: Coraza handles request payload inspection (OWASP Top 10); CrowdSec handles distributed IP reputation, bot detection, rate-abuse patterns.
- Not a WAF replacement; layered.

**APISIX rate-limiting:** `limit-req` and `limit-count` plugins at gateway level for per-tenant, per-route quotas. Redis backend for cluster-level rate state (Valkey reused).

### 4.9 TLS + Certificate Management: cert-manager + OpenBao PKI + step-ca

**Decision:** cert-manager as the Kubernetes certificate lifecycle controller. OpenBao PKI engine as the intermediate CA for internal service-to-service mTLS. step-ca as the ACME-capable self-hosted CA for air-gap and on-prem profiles. Let's Encrypt via cert-manager for internet-facing endpoints (SaaS profile only).

**Architecture:**

```
Root CA (offline, HSM-backed for regulated; software for lab)
  └── Intermediate CA: OpenBao PKI engine
        └── cert-manager (ClusterIssuer → OpenBao)
              ├── Service TLS certs (90-day, auto-renewed)
              ├── mTLS client certs (service mesh)
              └── Ingress/APISIX TLS (wildcard per tenant domain)

  └── step-ca (for air-gap / on-prem without internet)
        └── cert-manager step-issuer plugin
              ├── ACME server for automated cert issuance
              └── SSH cert issuance for operators
```

**cert-manager + Let's Encrypt:** SaaS profile only; requires internet DNS-01 or HTTP-01 challenge. Not used in air-gap.

**OpenBao PKI engine:** Used for all profiles. Issues intermediate CA certs; supports CRL + OCSP; short-lived certificates (90-day default; 24-hour for service-to-service mTLS to reduce revocation complexity).

**step-ca:** Self-hosted ACME server for on-prem and air-gap. Customers import step-ca root certificate; all internal services auto-enroll via ACME. SSH certificate provisioning for operator bastion access (replaces static SSH keys).

**TLS policy:**
- TLS 1.2 minimum (OWASP ASVS L2 §9.1); TLS 1.3 preferred.
- Cipher suites: ECDHE-ECDSA-AES256-GCM-SHA384, ECDHE-RSA-AES256-GCM-SHA384 (APISIX nginx cipher config).
- Certificate pinning: not mandated for service mesh (short-lived mTLS covers it); applied for critical external integrations (EHR, payment).
- HSTS: max-age=31536000; includeSubDomains; preload (internet-facing only).

### 4.10 Runtime Threat Detection: Falco + Tetragon (layered)

**Decision:** Both Falco and Tetragon deployed; Falco for broad detection and ecosystem integration; Tetragon for policy enforcement in multi-tenant namespaces.

**Falco:**
- CNCF graduated project; Apache 2.0.
- eBPF driver; 5–10% CPU overhead in high-throughput workloads (acceptable for background security telemetry).
- Detects: privilege escalation, container escape attempts, unexpected file writes to sensitive paths, exec in containers, K8s API server anomalies.
- Output: structured JSON → Wazuh SIEM (see §4.11) + PagerDuty alerts for critical findings.
- Custom rules for CuraOS: detect PHI path access outside HealthStack namespace; alert on OpenBao vault seal state changes; detect unexpected network connections from stateless services.

**Tetragon:**
- Cilium project; Apache 2.0.
- Kernel-level eBPF enforcement; <1% overhead.
- TracingPolicy CRD per namespace — enables per-tenant enforcement (HealthStack pods cannot exec `curl` or write to `/etc`).
- Enforces network egress at kernel level (complementing K8s NetworkPolicy which operates at IP/port level).
- Particularly valuable for multi-tenant CuraOS namespaces: a compromised HealthStack pod cannot pivot to neutral services even with a valid K8s ServiceAccount token.

**Wazuh** (§4.11) aggregates both Falco and Tetragon alerts alongside OS-level FIM and audit logs. Falco + Tetragon = detection/enforcement at runtime; Wazuh = SIEM correlation + compliance reporting.

### 4.11 SIEM + Compliance Monitoring: Wazuh

**Decision:** Wazuh as the self-hosted SIEM and XDR platform.

**Rationale:**
- GPL 2.0; self-hosted; no per-event pricing.
- Covers: log analysis, file integrity monitoring (FIM), intrusion detection (IDS), vulnerability detection, compliance reporting (PCI DSS, HIPAA, GDPR, NIST 800-53 out of box).
- HIPAA compliance dashboards built in; maps findings to Security Rule technical safeguards.
- Kubernetes: DaemonSet agent deployment with persistent identity across pod restarts.
- Integrates with: Falco (alert ingestion), Tetragon (policy violation ingestion), OpenBao audit log, PG audit table (via log shipper).
- Air-gap: fully self-hosted; no cloud dependency.
- Wazuh Cloud available for SaaS customers who prefer managed SIEM.

**Falco integration:** `falcosidekick` routes Falco alerts → Wazuh via syslog/webhook.
**PG audit:** Hash-chained audit table rows streamed to Wazuh for tamper detection correlation.

### 4.12 Penetration Testing

**Decision:** Hybrid — continuous automated (CI/CD) + annual manual (external firm).

| Cadence | Tooling | Scope |
|---|---|---|
| Every PR | Opengrep SAST + ZAP baseline | Changed services |
| Every staging deploy | ZAP full scan + Nuclei templates | All staging endpoints |
| Weekly | Trivy K8s Operator rescan | All cluster images |
| Every 6 months | Trivy + ZAP + Nuclei + Dependency-Track | Full vulnerability report (HIPAA 2025 §164.308(a)(8)) |
| Annual | External pen-test firm | Auth chains, IDOR, business logic, PHI access control, API authorization (OPA/SpiceDB), HIPAA ASVS L2 |
| On architectural change | Threat model review | ADR author + security team |

**Penetration test scope requirements:**
- OIDC/SAML token forgery attempts against Keycloak 26.
- OPA policy bypass — cross-tenant data access.
- SpiceDB relationship manipulation.
- OpenBao Transit key extraction.
- Kafka/NATS topic enumeration and unauthorized publish.
- FHIR R4 endpoint PHI enumeration.
- APISIX rate-limit bypass.
- Coraza WAF evasion.

### 4.13 Cryptographic Primitives

**PHI field-level encryption: Google Tink (tink-java 1.21+)**

```kotlin
// Example: encrypt PHI field in HealthStack service
val keysetHandle: KeysetHandle = CleartextKeysetHandle.read(
    JsonKeysetReader.withBytes(openBaoTransitFetchDek())
)
val aead: Aead = keysetHandle.getPrimitive(Aead::class.java)
val ciphertext: ByteArray = aead.encrypt(plaintextPhi, associatedData)
```

- Master key (KEK) lives in OpenBao Transit; DEK rotates every 90 days.
- `AesSivKeyManager` (Deterministic AEAD) for fields requiring equality search (patient MRN, SSN last-4).
- Rewrap job: scheduled Temporal workflow fetches ciphertext, decrypts with old DEK, re-encrypts with new DEK, writes back atomically within a DB transaction.

**Argon2id pepper management:**
- Pepper stored in OpenBao KV; loaded at service startup via ESO.
- Argon2id parameters: `m=65536, t=3, p=4` (OWASP recommended minimums for interactive login 2025).
- Password hashing: Spring Security `Argon2PasswordEncoder`; pepper prepended before hashing.
- Pepper rotation: dual-active window (old + new pepper validated during transition period).

**Bouncy Castle FIPS (BC-FJA 2.1.2):**
- Retained as an optional dependency for services requiring FIPS 140-2 certificate compliance (Certificate #4943 covers Java 8/11/17/21).
- Patch releases now published under FedRAMP update stream; CVE-2025-12194 (JVM GC overrun) patched in 2.1.2.
- Post-quantum (ML-KEM, ML-DSA, SLH-DSA): BC-FJA 3.0.0 early access; evaluate for adoption in 2027 planning cycle.
- Not used by default; enabled per-service flag `curaos.crypto.fips-mode=true`.

**PG17 pg_tde:**
- Enable on HealthStack and PHI-holding schemas only (neutral schemas: optional).
- Key reference: OpenBao Transit AES-256-GCM key via HTTP provider.
- WAL encryption: enabled (required for HIPAA "encryption of ePHI at rest" coverage at storage layer).
- Coordinate key rotation with Temporal workflow (pause WAL archiving, rotate key, resume).

### 4.14 Pre-commit Hook Toolchain

**Canonical `.pre-commit-config.yaml` for all CuraOS services:**

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.x.x   # pin to current release
    hooks:
      - id: gitleaks

  - repo: https://github.com/opengrep/opengrep
    rev: v1.x.x   # pin to current release
    hooks:
      - id: opengrep
        args: ["--config=p/kotlin", "--config=p/spring", "--error"]

  - repo: local
    hooks:
      - id: ktlint
        name: ktlint
        entry: ./gradlew ktlintCheck
        language: system
        pass_filenames: false
        files: \.kt$

      - id: detekt
        name: detekt
        entry: ./gradlew detekt
        language: system
        pass_filenames: false
        files: \.kt$

      - id: trivy-fs
        name: trivy filesystem scan
        entry: trivy fs --exit-code 1 --severity CRITICAL .
        language: system
        pass_filenames: false
        stages: [push]   # pre-push only, not pre-commit (slower)
```

**CI augmentations (not pre-commit; run in GitHub Actions / GitLab CI):**
- TruffleHog (full git history scan on first push; incremental on subsequent)
- ZAP baseline
- Nuclei
- Trivy image scan
- Opengrep full scan (not diff-only)
- SonarQube quality gate check

### 4.15 Vulnerability Disclosure + SBOM Publication

**SBOM publication:**
- CycloneDX SBOM generated per image per build via `trivy image --format cyclonedx`.
- Published to: OCI artifact registry (co-located with image, using OCI referrers API); Dependency-Track for continuous monitoring.
- SLSA Build L2 provenance attestation via GitHub Actions `slsa-github-generator`; attestation attached to OCI image.
- SBOM format: CycloneDX 1.6 (current standard; supported by Dependency-Track and most ingestion tools).

**Vulnerability disclosure:**
- `/.well-known/security.txt` at all public endpoints:
  ```
  Contact: mailto:security@curaos.io
  Expires: (annual update)
  Preferred-Languages: en
  Policy: https://curaos.io/security/disclosure-policy
  ```
- 90-day coordinated disclosure window (industry standard).
- GitHub Security Advisories for public CVE assignment.
- Internal: Wazuh + Dependency-Track track CVE status; Jira tickets auto-created via Dependency-Track webhook on new HIGH/CRITICAL findings.
- SLA: CRITICAL patch within 7 days; HIGH within 30 days; MEDIUM within 90 days.

---

## 5. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Developer Workstation                               │
│  pre-commit: Gitleaks → Opengrep → ktlint/detekt → trivy-fs (pre-push)     │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ git push
┌──────────────────────────────▼──────────────────────────────────────────────┐
│                         CI Pipeline (GitHub Actions / GitLab)               │
│  TruffleHog → Opengrep full → SonarQube gate → Trivy image → ZAP baseline  │
│  Nuclei → SBOM (CycloneDX) → Dependency-Track ingest → SLSA provenance     │
│  Gitleaks CI mode → OCI push with attestation                               │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ deploy
┌──────────────────────────────▼──────────────────────────────────────────────┐
│                        Kubernetes Cluster                                    │
│                                                                              │
│  Ingress: APISIX (rate-limit, mTLS termination)                             │
│    └── Coraza WAF (proxy-wasm, OWASP CRS PL1)                               │
│    └── CrowdSec bouncer (IP reputation, behavioral)                         │
│                                                                              │
│  Identity plane: Keycloak 26 → OPA → SpiceDB                               │
│                                                                              │
│  Secrets plane:                                                              │
│    OpenBao cluster (Raft, 3 nodes)                                          │
│      ├── Transit KMS (PHI field encryption KEKs)                            │
│      ├── PKI engine (intermediate CA → cert-manager)                        │
│      ├── KV v2 (static secrets → ESO → K8s Secrets)                        │
│      └── Database engine (dynamic PG/Valkey creds)                         │
│                                                                              │
│  Runtime detection:                                                          │
│    Falco (eBPF, detect) → falcosidekick → Wazuh                            │
│    Tetragon (eBPF, enforce) → TracingPolicy per namespace                   │
│                                                                              │
│  Certificate lifecycle: cert-manager                                         │
│    ├── ClusterIssuer → OpenBao PKI (all profiles)                          │
│    ├── ClusterIssuer → Let's Encrypt (SaaS profile only)                   │
│    └── ClusterIssuer → step-ca (air-gap / on-prem profile)                 │
│                                                                              │
│  Scanning: Trivy K8s Operator (continuous image rescan)                     │
│                                                                              │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ alerts + logs
┌──────────────────────────────▼──────────────────────────────────────────────┐
│                       Wazuh SIEM                                             │
│  Sources: Falco, Tetragon, OpenBao audit, PG hash-chained audit,            │
│           K8s audit logs, APISIX access logs, Coraza WAF events             │
│  Outputs: HIPAA compliance dashboard, PagerDuty (critical), Jira tickets    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. HIPAA Security Rule Controls Mapping (2025 Revision)

All specifications now mandatory (164.308–164.316). Compliance window: 240 days from May 2026 finalization.

### Administrative Safeguards (§164.308)

| Standard | Implementation Spec | CuraOS Component |
|---|---|---|
| Security management (a)(1) | Risk analysis | Wazuh vulnerability reports + annual pen-test |
| Security management (a)(1) | Risk management | Dependency-Track policy engine + Jira workflow |
| Workforce training (a)(5) | Security training | Out of scope (HR process) |
| Contingency plan (a)(7) | Data backup | SeaweedFS WORM + PG17 PITR; tested quarterly |
| Contingency plan (a)(7) | Disaster recovery | Raft HA + cross-region PG streaming replication |
| Contingency plan (a)(7) | Emergency access | OpenBao break-glass token + Wazuh alert |
| Evaluation (a)(8) | Vulnerability scanning ≥6mo | Trivy K8s Operator + ZAP + Nuclei scheduled |
| Evaluation (a)(8) | Penetration test annual | External firm (see §4.12) |
| BA contracts (b) | BAA | Required for all HealthStack SaaS tenants |

### Physical Safeguards (§164.310)

| Standard | CuraOS Component |
|---|---|
| Facility access | Self-hosted: customer datacenter controls; SaaS: provider ISO 27001 |
| Workstation use | Out of scope (customer policy) |
| Device/media controls | SeaweedFS WORM (media reuse controls); Trivy base image scanning |

### Technical Safeguards (§164.312)

| Standard | Implementation Spec | CuraOS Component |
|---|---|---|
| Access control (a)(1) | Unique user identification | Keycloak 26 (mandatory MFA for ePHI access) |
| Access control (a)(1) | Emergency access procedure | OpenBao break-glass + Wazuh audit |
| Access control (a)(1) | Automatic logoff | Keycloak session timeout + token TTL |
| Access control (a)(1) | Encryption/decryption | Tink AEAD (field-level) + pg_tde (storage) |
| Audit controls (b) | Hardware/software audit | Hash-chained PG audit + Wazuh SIEM |
| Integrity (c)(1) | ePHI not improperly altered | Hash-chained audit log + SeaweedFS WORM |
| Person/entity authentication (d) | Authentication | Keycloak 26 MFA + OPA + SpiceDB |
| Transmission security (e)(2) | Encryption in transit | TLS 1.3 (APISIX) + mTLS (cert-manager/OpenBao PKI) |
| Transmission security (e)(2) | Encryption at rest | Tink (PHI fields) + pg_tde (PG storage) + SeaweedFS at-rest encryption |

**New 2025 mandatory additions:**
| Requirement | Implementation |
|---|---|
| MFA for all ePHI access | Keycloak 26 mandatory MFA policy; hardware key (WebAuthn) for privileged operators |
| Technology asset inventory (annual) | Trivy K8s Operator SBOM + Dependency-Track asset list |
| Network mapping (ePHI flows) | Tetragon network audit + APISIX access log analysis; documented in ops/ePHI-flow-map.md |
| 72-hour restoration | Flowable SLA timer on incident response process; Temporal durable recovery workflow |
| 24-hour BA notification | Automated Wazuh alert → PagerDuty → on-call BA contact |

---

## 7. GDPR Controls Mapping

| Principle | CuraOS Implementation |
|---|---|
| Data minimization | PHI in HealthStack overlay schemas only; neutral services hold references only |
| Encryption (Art. 32) | Tink field-level + pg_tde + TLS in transit |
| Access controls (Art. 32) | Keycloak + OPA + SpiceDB; RBAC + ABAC |
| Audit (Art. 30) | Hash-chained PG audit; Wazuh SIEM |
| Data subject rights (Art. 15–22) | Subject rights workflow in Flowable BPM; PHI field-level keys allow targeted decryption + deletion |
| Data residency | Tenant namespace isolation; deployment model selection at provisioning time |
| Breach notification (Art. 33) | Wazuh alert → 72-hour incident response (aligns with HIPAA) |
| DPA / processor agreements | Required for all HealthStack tenants; template in ops/legal/ |

---

## 8. OWASP ASVS L2 Coverage

| ASVS Chapter | Control | CuraOS Component |
|---|---|---|
| V1 Architecture | Secure design review | ADR process + threat model on architectural change |
| V2 Authentication | MFA, Argon2id, session management | Keycloak 26 MFA + Spring Security Argon2PasswordEncoder |
| V3 Session | Token binding, secure flags | Keycloak token TTL + APISIX secure cookie policy |
| V4 Access Control | RBAC/ABAC, least privilege | OPA + SpiceDB + Keycloak roles |
| V5 Validation | Input validation, output encoding | Coraza WAF + Spring validation annotations |
| V6 Cryptography | Approved algorithms, key length | Tink AES-256-GCM + ECDSA-P384 + TLS 1.3 |
| V7 Error Handling | No stack traces, log errors | Spring Boot error handling filter; Wazuh log analysis |
| V8 Data Protection | PHI encryption, retention | Tink (field) + pg_tde (storage) + SeaweedFS WORM |
| V9 Communication | TLS 1.2+ minimum | cert-manager + APISIX cipher config |
| V10 Malicious Code | Secret scanning, integrity | Gitleaks + TruffleHog + Trivy |
| V11 Business Logic | Anti-automation, workflow limits | Keycloak rate-limiting + APISIX limit-req + CrowdSec |
| V12 Files & Resources | Upload validation, storage | APISIX + Coraza WAF + SeaweedFS access control |
| V13 API | API security, schema validation | APISIX OpenAPI enforcement + ZAP/Nuclei DAST |
| V14 Config | Dependency analysis, secrets | Trivy + Dependency-Track + OpenBao ESO |

---

## 9. SOC 2 / ISO 27001 Alignment

**SOC 2 Trust Services Criteria (relevant):**

| TSC | Control | CuraOS Component |
|---|---|---|
| CC6.1 | Logical access restrictions | Keycloak + OPA + SpiceDB |
| CC6.2 | Authentication | MFA; Argon2id; session timeouts |
| CC6.3 | Access removal | Keycloak account lifecycle + SpiceDB relationship cleanup |
| CC6.6 | Vulnerability management | Trivy + Dependency-Track + ZAP + Nuclei |
| CC6.7 | Malware/unauthorized software | Falco + Tetragon + Coraza WAF |
| CC7.1 | Threat detection | Wazuh SIEM + Falco + Tetragon |
| CC7.2 | Anomaly evaluation | Wazuh correlation rules |
| CC7.3 | Incident response | Flowable incident process; 72-hour SLA |
| CC8.1 | Change management | Git-based; ADR process; CI security gates |
| A1.2 | Availability | Raft HA + PG HA + Valkey Sentinel |

**ISO 27001:2022 relevant controls:**

| Control | CuraOS Component |
|---|---|
| A.5.14 Information transfer | TLS + mTLS + encrypted PHI fields |
| A.5.23 Cloud services | Self-hosted first; cloud overlay security review required |
| A.8.7 Malware protection | Falco + Tetragon + Trivy K8s Operator |
| A.8.8 Vulnerability management | Trivy + Dependency-Track + ZAP + annual pen-test |
| A.8.9 Configuration management | SOPS + GitOps + OpenBao ESO |
| A.8.24 Cryptography | Tink + OpenBao Transit + TLS 1.3 + Argon2id |
| A.8.25 Secure development | Opengrep + SonarQube + pre-commit hooks |
| A.8.29 Security testing | ZAP + Nuclei + annual pen-test |

---

## 10. Component Inventory

| Component | Role | License | Version | Profile |
|---|---|---|---|---|
| OpenBao | Secrets manager | MPL 2.0 | 2.5.3 | All |
| External Secrets Operator | K8s secret sync | Apache 2.0 | latest | All |
| SOPS + age | GitOps secret encryption | MPL 2.0 | latest | All |
| Google Tink (tink-java) | PHI field encryption | Apache 2.0 | 1.21.0 | All |
| Bouncy Castle FIPS (BC-FJA) | FIPS overlay | MIT (non-commercial BC) | 2.1.2 | FIPS-only |
| Opengrep | SAST (pre-commit + CI) | MPL 2.0 | 1.x | CI |
| SonarQube Community | SAST (scheduled deep) | LGPL 3.0 | 10.x | CI |
| CodeQL | SAST (optional call-graph) | MIT | latest | CI (opt-in) |
| OWASP ZAP | DAST (crawl + fuzz) | Apache 2.0 | 2.x | CI + nightly |
| Nuclei | DAST (template-based) | MIT | 3.x | CI + staging |
| Trivy | Container + SBOM scan | Apache 2.0 | 0.5x | CI + K8s |
| Dependency-Track | Continuous SBOM monitoring | Apache 2.0 | 4.x | Ops |
| Syft + Grype | SBOM ad-hoc + EPSS triage | Apache 2.0 | latest | Dev + CI |
| Gitleaks | Secret scanning (pre-commit) | MIT | 8.x | Pre-commit |
| TruffleHog | Secret verification (CI) | AGPL 3.0 | 3.x | CI |
| Dockle | Dockerfile linting | Apache 2.0 | 0.x | CI (PR) |
| Coraza WAF | WAF (APISIX proxy-wasm) | Apache 2.0 | 3.x | All |
| OWASP CRS | WAF ruleset | Apache 2.0 | 4.x | All |
| CrowdSec | IP reputation + behavioral | MIT | 1.x | All |
| Falco | Runtime detection (eBPF) | Apache 2.0 | 0.3x | All |
| Tetragon | Runtime enforcement (eBPF) | Apache 2.0 | 1.x | All |
| Wazuh | SIEM + XDR | GPL 2.0 | 4.x | All |
| cert-manager | K8s cert lifecycle | Apache 2.0 | 1.x | All |
| step-ca | Self-hosted CA + ACME | Apache 2.0 | 0.2x | Air-gap/on-prem |
| pg_tde | PG17 tablespace encryption | PostgreSQL License | 2.x | HealthStack |
| falcosidekick | Falco alert router | MIT | latest | All |

---

## 11. Integration Points

### 11.1 Files That Must Not Break

| File | Why |
|---|---|
| `curaos/backend/services/identity-service/` | Keycloak integration; OPA/SpiceDB wiring; break = all auth fails |
| `curaos/ops/k8s/base/openbao/` | OpenBao Helm values; break = secrets plane down |
| `curaos/ops/k8s/base/cert-manager/` | TLS certs; break = all HTTPS down |
| `curaos/ops/k8s/base/apisix/` | Gateway + Coraza WAF plugin config |
| `ai/curaos/backend/services/identity-service/Requirements.md` | Auth service ADR reference |
| `ai/curaos/docs/adr/0104-identity-auth.md` | Keycloak/OPA/SpiceDB decisions |

### 11.2 Event Producer/Consumer Map (security-relevant)

| Event | Producer | Consumer | Purpose |
|---|---|---|---|
| `security.secret.rotation` | OpenBao audit log | Wazuh | Alert on unexpected key access |
| `security.cert.expiry` | cert-manager | PagerDuty | 30/7/1 day warnings |
| `security.waf.block` | Coraza WAF | Wazuh + CrowdSec | Correlated attack detection |
| `security.runtime.alert` | Falco / Tetragon | Wazuh → PagerDuty | Runtime threat escalation |
| `security.vulnerability.found` | Dependency-Track | Jira webhook | Auto-ticket on HIGH/CRITICAL |
| `security.incident.opened` | Wazuh | Flowable BPM | Incident response SLA timer start |
| `audit.phi.access` | All HealthStack services | Hash-chained PG audit | HIPAA access log |

### 11.3 Cross-Phase Dependencies

| This ADR | Depends on | Dependency |
|---|---|---|
| OpenBao KV | ADR-0101 (PG17) | Raft storage or PG backend |
| OpenBao PKI | ADR-0103 (APISIX) | mTLS cert issuance for gateway |
| OpenBao Transit | ADR-0101 (PG17 + pg_tde) | KEK reference for TDE |
| Keycloak MFA | ADR-0104 (Keycloak 26) | Session + token policy |
| Coraza WAF | ADR-0103 (APISIX) | proxy-wasm plugin must be enabled in APISIX build |
| Falco + Tetragon | ADR-0100 (K8s runtime) | eBPF kernel version ≥ 5.8 on all nodes |
| Wazuh | ADR-0102 (Kafka/NATS) | Log shipping via syslog; not Kafka consumer |
| Dependency-Track | ADR-0100 (CI) | CycloneDX SBOM artifact published from CI |

---

## 12. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OpenBao governance concentration (few core contributors) | Medium | High | Commercial support from Adfinis/ControlPlane; monitor contributor diversity; egress path = Vault Community if MPL-migration needed |
| Falco + Tetragon eBPF overhead on high-throughput nodes | Low | Medium | Benchmark with `hyperfine` before rollout; tune Falco driver (eBPF vs kernel module); Tetragon <1% overhead at kernel level |
| Coraza WAF false positives (CRS PL1) | Medium | Medium | Start PL1; tune per-route; CI runs CRS test suite on every ruleset update |
| TruffleHog AGPL licensing confusion | Low | Low | Running TruffleHog as a CI tool is not distribution; document in legal/license-notes.md |
| Semgrep Rules License ambiguity | High (if Semgrep CE retained) | Medium | Resolved by switching to Opengrep; no Semgrep Rules License rules used |
| BC-FJA 3.0 post-quantum timeline | Low | Low | 3.0.0 in early access; adopt in 2027 planning cycle when NIST PQ standards finalized |
| HIPAA 2025 rule finalization delay | Medium | Low | 240-day compliance window; controls mapped; implementation ready before window closes |
| pg_tde extension maturity | Medium | Medium | pg_tde GA in PG17; test under load before enabling on production HealthStack schemas; fallback = application-layer Tink only |

---

## 13. Consequences

**Positive:**
- Full self-hosted, air-gap capable security stack with zero proprietary dependencies in the core path.
- OpenBao MPL 2.0 eliminates BUSL licensing friction for CuraOS commercial distribution.
- Trivy consolidates container scanning + SBOM + IaC + secrets detection into one binary; reduces tool sprawl.
- Dependency-Track provides continuous SBOM monitoring with EPSS prioritization; reduces alert fatigue.
- Dual Falco (detect) + Tetragon (enforce) runtime security gives defense-in-depth for multi-tenant namespace isolation.
- HIPAA 2025 mandatory controls mapped to named components; audit evidence available from day 1.
- Opengrep + Gitleaks + TruffleHog + ZAP + Nuclei pipeline covers OWASP ASVS L2 dynamic and static testing.

**Negative / Trade-offs:**
- OpenBao lacks FIPS 140-3 certified builds; FIPS path requires HSM or migration to Vault Enterprise.
- Tetragon requires eBPF kernel ≥ 5.8; air-gap on-prem nodes with older kernels need kernel upgrade or Falco-only mode.
- SonarQube Community requires a running server process; adds ops overhead vs. pure CLI tools.
- Wazuh GPL 2.0 — not a concern for internal deployment, but note if reselling managed SIEM as a CuraOS feature.
- Annual external penetration test cost (~$15–50k depending on scope and firm); not a tooling cost, but a budget line.
- Opengrep is younger than Semgrep; rule ecosystem still growing; compensated by SonarQube deep scan.

---

## 14. Rejected Alternatives (Summary)

| Component | Rejected Option | Reason |
|---|---|---|
| Secrets manager | HashiCorp Vault | BUSL 1.1; IBM competitive clause blocks SaaS embedding |
| Secrets manager | Infisical | Dynamic secrets gap; simpler but less mature for 91-service rotation |
| SAST | Semgrep CE | Rules License v1.0 restricts competing SaaS use |
| DAST | Burp Suite Community | No CI automation without paid license |
| Scanning | Snyk (all products) | SaaS dependency; per-seat cost at 91-service scale |
| WAF | ModSecurity | No native APISIX proxy-wasm integration; C deps add build complexity |
| WAF | Cloud WAF | Violates self-hosted first |
| Runtime | Sysdig | Commercial; not evaluated |
| Crypto | JCE raw | Misuse-prone API; Tink preferred |
| SBOM monitoring | OSV-Scanner standalone | No continuous monitoring; Dependency-Track chosen |

---

## 15. Review Schedule

- **6 months:** Review OpenBao 2.6 release notes; assess namespace + replication feature parity with Vault.
- **12 months:** Review Opengrep ecosystem growth; reconsider CodeQL as primary if Opengrep Kotlin coverage gaps surface.
- **12 months:** Assess BC-FJA 3.0.0 post-quantum GA status; plan migration strategy.
- **18 months:** Evaluate Tetragon 2.x for network policy enforcement consolidation (potentially replace K8s NetworkPolicy for HealthStack namespaces).
- **24 months:** Re-evaluate Infisical dynamic secrets maturity; consider as developer-facing secrets UX layer over OpenBao.
- **On HIPAA rule finalization (expected May 2026 + 240 days):** Verify all mandatory controls implemented; generate audit evidence report from Wazuh + Dependency-Track.

---

## References

- [HashiCorp Vault vs OpenBao — Jorijn Schrijvershof](https://jorijn.com/en/blog/hashicorp-vault-vs-openbao/)
- [OpenBao vs HashiCorp Vault 2026 — Medium](https://lalatenduswain.medium.com/openbao-vs-hashicorp-vault-the-secrets-management-showdown-every-devops-team-needs-to-read-in-2026-458ae0d9a408)
- [Important updates to Semgrep OSS — Semgrep Blog](https://semgrep.dev/blog/2024/important-updates-to-semgrep-oss/)
- [Opengrep Forks Semgrep — InfoQ](https://www.infoq.com/news/2025/02/semgrep-forked-opengrep/)
- [Opengrep — Crash Override Blog](https://crashoverride.com/blog/opengrep-the-security-industry-deserves-better)
- [Trivy vs Grype 2026 — AppSec Santa](https://appsecsanta.com/sca-tools/trivy-vs-grype)
- [Trivy vs Grype vs Snyk CI/CD — Secure Pipelines](https://secure-pipelines.com/ci-cd-security/ci-cd-security-scanners-compared-trivy-grype-snyk-checkov/)
- [Falco vs Tetragon — Medium](https://medium.com/@mughal.asim/falco-vs-tetragon-a-runtime-security-showdown-for-kubernetes-a0e9fb9f30a0)
- [Securing Multi-Tenant Kubernetes with Falco — vCluster Blog](https://www.vcluster.com/blog/securing-vcluster-with-falco)
- [Google Tink for Developers](https://developers.google.com/tink)
- [Bouncy Castle Java FIPS 2.1.2 — bcgit/bc-java Discussion](https://github.com/bcgit/bc-java/discussions/2193)
- [TruffleHog vs Gitleaks — Jit](https://www.jit.io/resources/appsec-tools/trufflehog-vs-gitleaks-a-detailed-comparison-of-secret-scanning-tools)
- [DAST Tools Comparison — Rafter](https://rafter.so/blog/dast-tools-comparison)
- [OWASP Dependency-Track](https://dependencytrack.org/)
- [OWASP Top 10:2025 A03 — Software Supply Chain](https://owasp.org/Top10/2025/A03_2025-Software_Supply_Chain_Failures/)
- [HIPAA Security Rule Changes 2025-2026 — RubinBrown](https://www.rubinbrown.com/insights-events/insight-articles/hipaa-security-rule-changes-2025-2026-hipaa-updates/)
- [HIPAA Security Rule Technical Safeguards — HHS](https://www.hhs.gov/sites/default/files/ocr/privacy/hipaa/administrative/securityrule/techsafeguards.pdf)
- [Coraza WAF APISIX Integration — Apache APISIX Blog](https://apisix.apache.org/blog/2024/02/13/apisix-owasp-coraza-core-ruleset/)
- [OpenBao Transit Engine — OpenBao Docs](https://openbao.org/docs/secrets/transit/)
- [Infisical vs HashiCorp Vault — Infisical](https://infisical.com/infisical-vs-hashicorp-vault)
- [CrowdSec WAF Overview](https://www.crowdsec.net/blog/crowdsec-waf-the-collaborative-future-of-web-application-security)
- [step-ca Kubernetes ACME — Smallstep](https://smallstep.com/docs/tutorials/kubernetes-acme-ca/)
- [SOPS + age for GitOps — OneUptime Blog](https://oneuptime.com/blog/post/2026-02-09-sops-age-encryption-kubernetes-secrets/view)
- [Wazuh Cloud Native + Falco — Wazuh Blog](https://wazuh.com/blog/cloud-native-security-with-wazuh-and-falco/)
- [Field-Level Encryption HIPAA — hoop.dev](https://hoop.dev/blog/field-level-encryption-hipaa-protecting-sensitive-data-with-precision/)
- [OWASP CRS + Coraza WAF — OWASP Developer Guide](https://devguide.owasp.org/en/09-operations/02-coraza/)
- [eBPF Runtime Security Comparative Analysis — SciTePress 2025](https://www.scitepress.org/Papers/2025/142727/142727.pdf)
