# providers — Agent Context

## Status

M1 stub scaffolded 2026-05-25. Full impl per ISSUE-ROADMAP [curaos#28](https://github.com/your-org/curaos/issues/28) (CLOSED) + [curaos-ai-workspace#32](https://github.com/your-org/curaos-ai-workspace/issues/32) (CLOSED).

## Intent

Provider-Abstraction Convention (ADR-0154): typed `<Domain>Provider` interfaces + `ProviderRegistry` implementing local-vs-3rd-party selection per domain (see [[curaos-local-vs-3rdparty-rule]]). Exports `CuraOSProvider<TConfig>` base interface, `ProviderRegistry`, and `@curaos/providers` base package that per-domain `@curaos/<domain>-provider` packages extend.
