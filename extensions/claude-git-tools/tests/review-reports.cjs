const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadModule(name, suffix = "") {
  const source = readFileSync(join(__dirname, "../src", name), "utf8");
  const code = ts.transpileModule(source + suffix, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (id) =>
      id.startsWith("./") || id === "@raycast/api" ? {} : require(id),
    process,
    console,
  });
  return module.exports;
}

const { extractReviewReports } = loadModule("task-detail.tsx");
const report = "# PR 审查报告\n\n**结论**: 有警告\n\n- WARN：缺少输入校验。";
const output = [
  "Skill description: report wrapped in !--------! delimiters.",
  "Never post !--------! delimiters to GitHub.",
  "Report template mentions `!--------!` again.",
  "Thinking through the implementation and running commands...",
  "!--------!",
  report,
  "!--------!",
  "PR: https://github.com/example/repo/pull/1",
].join("\n");
assert.deepEqual(
  Array.from(extractReviewReports(output, 100), (entry) => entry.markdown),
  [report],
);
assert.equal(
  extractReviewReports("Only mention `!--------!` twice: !--------!").length,
  0,
);
assert.equal(extractReviewReports(`!--------!\n${report}`).length, 0);
assert.equal(
  extractReviewReports(`  !--------!\r\n${report}\r\n\t!--------!`).length,
  1,
);
assert.deepEqual(
  Array.from(
    extractReviewReports(
      `!--------!\nOlder report\n!--------!\n!--------!\n${report}\n!--------!`,
    ),
    (entry) => entry.markdown,
  ),
  [report, "Older report"],
);

const {
  buildTaskPrompt,
  buildClaudePrompt,
  buildOpenCodeCommand,
  outputFormatterScript,
} = loadModule(
  "task-manager.ts",
  "\nexport { buildTaskPrompt, buildClaudePrompt, buildOpenCodeCommand, outputFormatterScript };\n",
);
for (const prompt of [
  buildTaskPrompt("review-pr", {
    prUrl: "https://github.com/example/repo/pull/1",
  }),
  buildClaudePrompt(
    "review-pr",
    { prUrl: "https://github.com/example/repo/pull/1" },
    "/skills/pr-review/SKILL.md",
  ),
]) {
  assert.ok(prompt.includes("concise Chinese report"));
  assert.ok(prompt.includes("Do not include reasoning"));
  assert.ok(prompt.includes("standalone lines"));
}
assert.equal(
  buildTaskPrompt("create-pr", { targetBranch: "main" }),
  "$ARGUMENTS=main",
);

const formatted = spawnSync(process.execPath, ["-e", outputFormatterScript], {
  env: { ...process.env, AGENT: "codex" },
  input:
    JSON.stringify({
      type: "item.completed",
      item: {
        id: "read-skill",
        type: "command_execution",
        command: "/bin/zsh -lc \"sed -n '1,260p' /skills/pr-review/SKILL.md\"",
        aggregated_output:
          "Skill description: report wrapped in !--------! delimiters.",
        exit_code: 0,
      },
    }) +
    "\n" +
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "agent_message",
        text: `!--------!\n${report}\n!--------!`,
      },
    }) +
    "\n",
  encoding: "utf8",
});
assert.equal(formatted.status, 0, formatted.stderr);
assert.ok(!formatted.stdout.includes("Skill description"));
assert.equal(extractReviewReports(formatted.stdout)[0].markdown, report);

for (const template of [
  "```markdown\n!--------!\n# Report Template\n{details}\n!--------!\n```",
  "```markdown\n!--------!\n# Truncated Report Template\n{details}",
]) {
  for (const agent of ["claude", "codex", "opencode", "gemini"]) {
    const finalText = `!--------!\n${report}\n!--------!\n`;
    const toolEvent =
      agent === "codex"
        ? {
            type: "item.completed",
            item: {
              type: "command_execution",
              command: "echo template",
              aggregated_output: template,
              exit_code: 0,
            },
          }
        : { type: "tool_result", content: template };
    const finalEvent =
      agent === "claude"
        ? {
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: finalText },
            },
          }
        : agent === "codex"
          ? {
              type: "item.completed",
              item: { type: "agent_message", text: finalText },
            }
          : { type: "message", role: "assistant", content: finalText };
    const agentOutput = spawnSync(
      process.execPath,
      ["-e", outputFormatterScript],
      {
        env: { ...process.env, HOME: __dirname, AGENT: agent },
        input:
          [toolEvent, finalEvent]
            .map((event) => JSON.stringify(event))
            .join("\n") + "\n",
        encoding: "utf8",
      },
    );
    assert.equal(agentOutput.status, 0, agentOutput.stderr);
    assert.deepEqual(
      Array.from(
        extractReviewReports(agentOutput.stdout),
        (entry) => entry.markdown,
      ),
      [report],
    );
  }
}
const findings = Array.from(
  { length: 6 },
  (_, index) => `- WARN：关键问题 ${index + 1}。`,
).join("\n");
const findingsOutput = spawnSync(
  process.execPath,
  ["-e", outputFormatterScript],
  {
    env: { ...process.env, AGENT: "codex" },
    input:
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "agent_message",
          text: `!--------!\n# PR 审查报告\n\n${findings}\n!--------!`,
        },
      }) + "\n",
    encoding: "utf8",
  },
);
assert.equal(findingsOutput.status, 0, findingsOutput.stderr);
assert.ok(
  extractReviewReports(findingsOutput.stdout)[0].markdown.includes(findings),
);

const prUrl = "https://github.com/example/repo/pull/2";
const openCodeEvents = [
  {
    type: "step_start",
    part: { type: "step-start", snapshot: "hidden-start" },
  },
  {
    type: "tool_use",
    part: {
      tool: "shell",
      state: {
        status: "completed",
        input: { command: "git diff" },
        output:
          "[old commit](https://github.com/example/repo/commit/deadbeef)\n!--------!\nfake report\n!--------!",
      },
    },
  },
  {
    type: "tool_use",
    part: {
      tool: "shell",
      state: {
        status: "error",
        input: { command: "git push" },
        error: "push rejected",
      },
    },
  },
  {
    type: "text",
    part: { type: "text", text: `!--------!\n${report}\n!--------!\n${prUrl}` },
  },
  {
    type: "step_finish",
    part: { type: "step-finish", reason: "hidden-finish" },
  },
  {
    type: "error",
    error: { type: "unknown", message: "provider unavailable" },
  },
];
const openCodeOutput = spawnSync(
  process.execPath,
  ["-e", outputFormatterScript],
  {
    env: { ...process.env, HOME: __dirname, AGENT: "opencode" },
    input: openCodeEvents
      .map((event) => JSON.stringify({ sessionID: "ses_test", ...event }))
      .join("\n"),
    encoding: "utf8",
  },
);
assert.equal(openCodeOutput.status, 0, openCodeOutput.stderr);
assert.deepEqual(
  Array.from(
    extractReviewReports(openCodeOutput.stdout),
    (entry) => entry.markdown,
  ),
  [report],
);
for (const text of [
  prUrl,
  "git diff",
  "git push",
  "push rejected",
  "provider unavailable",
]) {
  assert.ok(openCodeOutput.stdout.includes(text), text);
}
assert.doesNotMatch(
  openCodeOutput.stdout,
  /hidden-start|hidden-finish|deadbeef/,
);

const tempDir = mkdtempSync(join(tmpdir(), "opencode-command-"));
try {
  const promptFile = join(tempDir, "skill's prompt");
  const prompt = 'Keep "$ARGUMENTS" intact.\nDo not expand $(id).';
  writeFileSync(promptFile, prompt);
  for (const [model, expected] of [
    ["", ""],
    ["provider/model", "provider/model#high"],
    ["provider/model#low", "provider/model#low"],
  ]) {
    const result = spawnSync(
      "/bin/bash",
      [
        "-c",
        [
          'opencode() { printf "%s\\0" "$@" ""; cat; }',
          buildOpenCodeCommand(promptFile, model),
        ].join("\n"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const [argv, stdin] = result.stdout.split("\0\0");
    const args = argv.split("\0");
    assert.equal(stdin, prompt);
    assert.ok(
      args.includes("run") &&
        args.includes("--standalone") &&
        args.includes("--auto"),
    );
    assert.equal(args[args.indexOf("--format") + 1], "json");
    assert.equal(args.includes("--model"), Boolean(expected));
    if (expected) assert.equal(args[args.indexOf("--model") + 1], expected);
    assert.ok(
      !args.includes("--variant") &&
        !args.includes("--dangerously-skip-permissions"),
    );
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
console.log("Review report boundary, prompt, and formatter checks passed");
