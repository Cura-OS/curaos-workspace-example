function normalizeSeverity(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["critical", "error", "high"].includes(text)) return "high";
  if (["warning", "warn", "medium"].includes(text)) return "medium";
  if (["info", "note", "low"].includes(text)) return "low";
  return "low";
}

function lineInRanges(line, ranges) {
  const n = Number(line);
  if (!Number.isFinite(n) || n <= 0) return false;
  for (const range of ranges || []) {
    const start = Number(range.start);
    const end = Number(range.end);
    if (Number.isFinite(start) && Number.isFinite(end) && n >= start && n <= end) return true;
  }
  return false;
}

function findingTouchesChangedLine(finding, changedLines) {
  if (!changedLines || typeof changedLines.get !== "function") return false;
  const path = String(finding && finding.path || "");
  return lineInRanges(finding && finding.line, changedLines.get(path));
}

function semgrepFinding(result) {
  return {
    source: "semgrep",
    rule_id: String(result.check_id || ""),
    path: String(result.path || ""),
    line: Number(result.start && result.start.line),
    severity: normalizeSeverity(result.extra && result.extra.severity),
    message: String((result.extra && result.extra.message) || ""),
  };
}

function parseSemgrepJson(output) {
  if (!String(output || "").trim()) return null;
  const parsed = JSON.parse(output);
  if (!parsed || !Array.isArray(parsed.results)) {
    throw new Error("semgrep json missing results array");
  }
  return parsed;
}

function evaluateSemgrepJson(output, options = {}) {
  const required = options.required === true;
  let parsed;
  try {
    parsed = parseSemgrepJson(output);
  } catch (error) {
    return {
      verdict: required ? "block" : "unavailable",
      blocking: required,
      findings: required
        ? [{ source: "semgrep", severity: "critical", message: `semgrep output unparseable: ${error.message}` }]
        : [],
    };
  }

  if (!parsed) {
    return { verdict: "unavailable", blocking: false, findings: [] };
  }

  const findings = parsed.results.map(semgrepFinding);
  const blocking = findings.some((finding) => {
    return finding.severity === "high" && findingTouchesChangedLine(finding, options.changedLines);
  });
  return {
    verdict: blocking ? "block" : findings.length ? "advisory" : "clean",
    blocking,
    findings,
  };
}

module.exports = {
  evaluateSemgrepJson,
  findingTouchesChangedLine,
  normalizeSeverity,
};
