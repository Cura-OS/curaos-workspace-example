# Symphony Quality Gates

Status: gate mapping for adoption work
Related rule: [../../ai/rules/curaos_symphony_alignment_rule.md](../../ai/rules/curaos_symphony_alignment_rule.md)

## Gate stack

| Layer | Gate | Purpose |
|---|---|---|
| T1 | local docs and workflow checks | Catch drift before PR. |
| T1 | no em dash or en dash scan | Preserve brand voice and rule compliance. |
| T1 | persistent workflow source audit | Catch tracked and untracked workflow markdown plus script drift that docs-only checks miss. |
| T1 | local workpad updated | Preserve continuation state. |
| T1 | SQLite local issue state updated | Preserve machine-readable local issue truth without GitHub quota use. |
| T1 | local issue parent hierarchy set | Preserve main issue and child issue lineage for every task, blocker, follow-up, and verification lane. |
| T1 | TDD red and green evidence for script/code changes | Prove behavior before implementation and before refactor. |
| T2 | cross-harness or fresh review for high-impact changes | Catch policy and integration errors. |
| T3 | destructive, PHI, access-control, ai/rules changes, and other sensitive actions | Require typed human decision. |

## Phase 0 commands

```sh
node scripts/check-workflow-sync.js
node scripts/check-symphony-conformance.js
node scripts/check-symphony-source-audit.js
node --test scripts/check-docs.test.js scripts/lib/local-issues-db.test.js scripts/lib/symphony-conformance.test.js scripts/lib/symphony-source-audit.test.js
node scripts/generate-rule-index.js
bun scripts/check-doc-graph.js --write
bash scripts/check-docs.sh
python3 - <<'PY'
from pathlib import Path
changed = [p for p in Path('.').rglob('*.md') if '.git' not in p.parts]
bad = []
for p in changed:
    text = p.read_text(errors='ignore')
    if '\u2013' in text or '\u2014' in text:
        bad.append(str(p))
if bad:
    raise SystemExit('\n'.join(bad))
PY
```

## Evidence rule

Report command output and exit status. Do not claim conformance from prose alone.
