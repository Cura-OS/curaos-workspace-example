# Consume maintained Rice tooling

This sanitized template retains its code/document/rule/Git checks. It has no local
tracker, synchronization backend, run store or executable workflow copies.
The configured maintained Cura workspace owns that runtime and its policy,
provenance, source/scope resolution, native leases and delivery checks.

Use Node 24 or newer, native Git, the installed signed `rice-client` and the
project's existing Bun/just toolchain. Install Rice client/MCP/project skills with
the Rice repository's maintained `deploy/client/configure-projects.ts` workflow;
do not copy its installer or store credential values in this template.

Configure once with explicit existing references:

```bash
node scripts/rice-toolkit.js configure \
  --workspace-root /absolute/maintained/workspace \
  --client /absolute/bin/rice-client \
  --client-config /absolute/reference-only/client.json
```

The default profile is `~/.config/rice-observe/toolkits/cura-workspace.json`.
It contains nonsecret path references and is atomically written with mode 0600.
A fresh process loads that persisted profile without requiring a shell export.
`RICE_TOOLKIT_CONFIG` may select another absolute profile for a different owner.
No repository clone, secret values or fallback tracker is generated.

Commands run from the configured owning Git workspace with the explicit Rice
client/profile binding and native arguments preserved:

```bash
node scripts/rice-toolkit.js check
node scripts/rice-toolkit.js rice context --id source:canonical/task
node scripts/rice-toolkit.js work list --json
node scripts/rice-toolkit.js workflow context-load --args-json '{"issue":"source:canonical/task"}' --json
```

Work authoring uses the maintained runtime's JSON stdin commands. Workflow answers
use the stable request IDs and `--answers-file -`, not local result files.
Private lease grants stay in client memory/stdin. Query current policy, tasks and
blockers from Rice; never substitute a forge board or recovered local state.
The selected toolkit's owning gates and exact target review/provenance still
apply to delivery. This template's `just ci` checks its own current source only.

Missing, malformed or non-owning references refuse before execution. A supported
profile is required; the template cannot select itself as a runtime fallback.
Historical source and operative guides were preserved by their exact hashes in
Rice and external recovery before removal. They are not active instructions.
