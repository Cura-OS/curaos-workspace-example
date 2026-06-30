const OWNER_REPO_NUMBER_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/;
const OWNER_REPO_NUMBER_IN_TEXT_RE = /([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)/;
const ISSUE_URL_RE = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/(\d+)/i;

function isDotPathSegment(segment) {
  return /^\.+$/.test(String(segment || ""));
}

function assertSafeOwnerRepo(owner, repo, source, refKind, value) {
  if (!isDotPathSegment(owner) && !isDotPathSegment(repo)) return;
  throw new Error(
    `${source}: invalid ${refKind} ref ${JSON.stringify(value)}; owner/repo segments cannot be dot paths`,
  );
}

function ownerRepoNumber(owner, repo, number) {
  return {
    owner,
    repo,
    slug: `${owner}/${repo}`,
    number: String(number),
  };
}

function parseOwnerRepoNumberRef(value, options = {}) {
  const source = options.source || "gh-ref";
  const refKind = options.refKind || "issue";
  const match = String(value || "").trim().match(OWNER_REPO_NUMBER_RE);
  if (!match) {
    throw new Error(`${source}: invalid ${refKind} ref ${JSON.stringify(value)}; expected owner/repo#N`);
  }
  const [, owner, repo, number] = match;
  assertSafeOwnerRepo(owner, repo, source, refKind, value);
  return ownerRepoNumber(owner, repo, number);
}

function parseIssueRef(value, options = {}) {
  const parsed = parseOwnerRepoNumberRef(value, { ...options, refKind: "issue" });
  return { repo: parsed.slug, number: parsed.number };
}

function parseIssueRefOrUrl(value, options = {}) {
  const source = options.source || "gh-ref";
  const fieldName = options.fieldName || "issue";
  const text = String(value || "").trim();
  const match = text.match(ISSUE_URL_RE) || text.match(OWNER_REPO_NUMBER_RE);
  if (!match) {
    throw new Error(
      `${source}: invalid ${fieldName} issue ref ${JSON.stringify(text)}; expected owner/repo#N or GitHub issue URL`,
    );
  }
  const [, owner, repoName, number] = match;
  assertSafeOwnerRepo(owner, repoName, source, `${fieldName} issue`, text);
  const repo = `${owner}/${repoName}`;
  const numericNumber = Number(number);
  return {
    owner,
    repoName,
    repo,
    number: numericNumber,
    ref: `${repo}#${numericNumber}`,
  };
}

function parsePrRef(value, options = {}) {
  const parsed = parseOwnerRepoNumberRef(value, { ...options, refKind: "PR" });
  return { slug: parsed.slug, number: parsed.number };
}

function formatIssueRefFromMatch(match) {
  const [, owner, repo, number] = match;
  if (isDotPathSegment(owner) || isDotPathSegment(repo)) return "";
  return `${owner}/${repo}#${Number(number)}`;
}

function normalizeIssueRef(value) {
  const text = String(value || "").trim();
  if (!text || /^none\b/i.test(text)) return "";
  const urlMatch = text.match(ISSUE_URL_RE);
  if (urlMatch) return formatIssueRefFromMatch(urlMatch);
  const refMatch = text.match(OWNER_REPO_NUMBER_IN_TEXT_RE);
  if (refMatch) return formatIssueRefFromMatch(refMatch);
  return "";
}

module.exports = {
  isDotPathSegment,
  normalizeIssueRef,
  parseIssueRef,
  parseIssueRefOrUrl,
  parseOwnerRepoNumberRef,
  parsePrRef,
};
