const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_OUTPUT = path.join(".cache", "workflow-step-timings.jsonl");

function classifyWorkflowError(error) {
  const text = String((error && (error.stack || error.message)) || error || "").toLowerCase();
  if (text.includes("graphql") && text.includes("quota")) return "github-quota";
  if (text.includes("rate limit") || text.includes("secondary rate")) return "github-rate-limit";
  if (text.includes("blocked-harness") || text.includes("harness-unavailable")) return "harness-unavailable";
  if (text.includes("review-settle") || text.includes("external review")) return "external-review-wait";
  if (text.includes("timeout")) return "timeout";
  return "unknown";
}

function normalizeHeadSha(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{40}$/i.test(text) ? text.toLowerCase() : "";
}

function appendJsonl(outputPath, row) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.appendFileSync(outputPath, `${JSON.stringify(row)}\n`);
}

function createWorkflowTimer(options = {}) {
  const workflow = String(options.workflow || "").trim();
  if (!workflow) throw new Error("workflow timer requires workflow");
  const subject = String(options.subject || "").trim();
  const outputPath = options.outputPath || DEFAULT_OUTPUT;
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();

  async function phase(name, fn, meta = {}) {
    if (typeof fn !== "function") throw new Error("workflow timer phase requires function");
    const phaseName = String(name || "").trim();
    if (!phaseName) throw new Error("workflow timer phase requires name");
    const started = Number(nowMs());
    try {
      const result = await fn();
      const ended = Number(nowMs());
      appendJsonl(outputPath, {
        workflow,
        subject,
        phase: phaseName,
        head_sha: normalizeHeadSha(meta.headSha),
        duration_ms: Math.max(0, ended - started),
        status: "ok",
        idle_reason: String(meta.idleReason || ""),
        ts_ms: ended,
      });
      return result;
    } catch (error) {
      const ended = Number(nowMs());
      appendJsonl(outputPath, {
        workflow,
        subject,
        phase: phaseName,
        head_sha: normalizeHeadSha(meta.headSha),
        duration_ms: Math.max(0, ended - started),
        status: "failed",
        idle_reason: String(meta.idleReason || ""),
        error_class: classifyWorkflowError(error),
        error_message: String((error && error.message) || error || ""),
        ts_ms: ended,
      });
      throw error;
    }
  }

  return { phase };
}

module.exports = {
  DEFAULT_OUTPUT,
  classifyWorkflowError,
  createWorkflowTimer,
};
