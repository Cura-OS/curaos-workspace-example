# identity-service §2 - Codegen Commands (ADR-0153)

Run these recipes in order before writing any hand-code:

```bash
# 1. NestJS service scaffold
curaos codegen backend.nestjs-service \
  --name identity-service \
  --namespace identity

# 2. Tenant routing interceptor
curaos codegen interceptor.nestjs-tenant-router \
  --service identity-service

# 3. Audit interceptor
curaos codegen interceptor.nestjs-audit \
  --service identity-service

# 4. Better Auth controllers
curaos codegen auth.nestjs-controller-better-auth \
  --service identity-service

# 5. SCIM 2.0 endpoints
curaos codegen auth.scim-endpoint \
  --service identity-service

# 6. SAML connection management
curaos codegen auth.saml-idp-config \
  --service identity-service

# 7. SMART-on-FHIR App Launch 2.0
curaos codegen auth.smart-on-fhir-app \
  --service identity-service

# 8. Vitest test scaffold
curaos codegen tests.vitest-nestjs \
  --service identity-service
```

After codegen, hand-write:
- `src/authz/opa/` - OPA-WASM bootstrap + bundle loader + Valkey hot-reload listener.
- `src/authz/cerbos/` - Cerbos gRPC client + policy decision wrapper.
- `src/authz/openfga/` - OpenFGA REST client + tuple write helpers.
- `src/workflows/` - Temporal saga workflow definitions.
- `src/activities/` - Temporal saga activity implementations.
- `src/providers/` - EmailProvider, SecretsProvider, StorageProvider implementations.
