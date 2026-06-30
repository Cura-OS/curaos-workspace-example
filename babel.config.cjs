// RP-60: parser support for `just mutate` (Stryker instrumentation).
// The committed workflow executors use the dual-runtime dialect required by
// Claude's Workflow() tool + agent-workflow-kit: `export const meta` as the
// first statement AND a top-level `return result` (the runtimes wrap the file
// body in a function). Babel's parser rejects that top-level return unless
// allowReturnOutsideFunction is set; Stryker's instrumenter hardcodes
// sourceType "module" but merges this root config's parserOpts.
// No other tool in this repo consumes babel config (Bun-primary workspace).
module.exports = {
  parserOpts: {
    allowReturnOutsideFunction: true,
  },
};
