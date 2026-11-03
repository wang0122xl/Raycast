const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { PassThrough } = require("node:stream");
const vm = require("node:vm");
const ts = require("typescript");

function loadModule(name, mocks, suffix = "") {
  const filename = join(__dirname, "../src", `${name}.ts`);
  const code = ts.transpileModule(readFileSync(filename, "utf8") + suffix, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      require: (id) => mocks[id] ?? require(id),
      process,
      console,
      setTimeout,
      clearTimeout,
    },
    { filename },
  );
  return module.exports;
}

const model = {
  id: "model-a",
  model: "model-a",
  displayName: "Model A",
  description: "Test model",
  hidden: false,
  isDefault: true,
  defaultReasoningEffort: "low",
  supportedReasoningEfforts: [
    { reasoningEffort: "low", description: "Fast" },
    { reasoningEffort: "ultra", description: "Deep" },
  ],
};

async function checkCatalog(pages, expectedError, failToStart = false) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const requests = [];
  let killed = false;
  child.kill = () => {
    killed = true;
    return true;
  };
  child.stdin = new PassThrough();
  child.stdin.on("data", (data) => {
    const message = JSON.parse(data.toString());
    requests.push(message);
    if (message.method === "initialized") return;
    const response =
      message.method === "initialize" ? { result: {} } : pages.shift();
    setImmediate(() =>
      child.stdout.write(
        JSON.stringify({ id: message.id, ...response }) + "\n",
      ),
    );
  });
  const { getCodexModels } = loadModule("codex-models", {
    child_process: {
      spawn: (command, args, options) => {
        assert.equal(command, "codex");
        assert.deepEqual(Array.from(args), [
          "app-server",
          "--listen",
          "stdio://",
        ]);
        assert.equal(options.env.PATH, "test-path");
        if (failToStart)
          setImmediate(() => child.emit("error", new Error("ENOENT")));
        return child;
      },
    },
    "./git-utils": { EXTENDED_PATH: "test-path" },
  });
  if (expectedError) {
    await assert.rejects(getCodexModels(), expectedError);
  } else {
    const models = await getCodexModels();
    assert.deepEqual(JSON.parse(JSON.stringify(models)), [
      model,
      { ...model, id: "model-b", model: "model-b" },
    ]);
    assert.equal(requests[1].method, "initialized");
    assert.equal(requests[2].params.includeHidden, false);
    assert.equal(requests[3].params.cursor, "page-2");
  }
  assert.equal(killed, true);
}

(async () => {
  await checkCatalog([
    { result: { data: [model], nextCursor: "page-2" } },
    {
      result: {
        data: [
          { ...model, id: "model-b", model: "model-b" },
          { ...model, hidden: true },
        ],
        nextCursor: null,
      },
    },
  ]);
  await checkCatalog(
    [{ error: { message: "Login required" } }],
    /Login required/,
  );
  await checkCatalog(
    [{ result: { data: [{ ...model, supportedReasoningEfforts: "high" }] } }],
    /Invalid Codex model catalog/,
  );
  await checkCatalog(
    [{ result: { data: [model], nextCursor: 12 } }],
    /Invalid Codex model catalog/,
  );
  await checkCatalog([], /ENOENT/, true);

  const items = new Map();
  const storage = loadModule("storage", {
    "@raycast/api": {
      LocalStorage: {
        getItem: async (key) => items.get(key),
        setItem: async (key, value) => items.set(key, value),
      },
    },
  });
  items.set("selected-model:git-push:codex", "gpt-5.4");
  assert.equal(await storage.getCodexModelForCommand("git-push"), "gpt-5.4");
  assert.equal(
    await storage.getCodexReasoningEffortForCommand("git-push"),
    "high",
  );
  await storage.setCodexModelForCommand("git-push", "model-a");
  await storage.setCodexReasoningEffortForCommand("git-push", "ultra");
  assert.equal(await storage.getCodexModelForCommand("git-push"), "model-a");
  assert.equal(
    await storage.getCodexReasoningEffortForCommand("git-push"),
    "ultra",
  );
  assert.equal(
    await storage.getCodexReasoningEffortForCommand("review-pr"),
    "high",
  );

  const { buildCodexCommand } = loadModule(
    "task-manager",
    {
      "@raycast/api": {},
      "./storage": storage,
      "./git-utils": {},
    },
    "\nexport { buildCodexCommand };\n",
  );
  for (const effort of ["low", "medium", "high", "xhigh", "max", "ultra"]) {
    const command = buildCodexCommand("/tmp/prompt file", "model-a", effort);
    assert.ok(command.includes(`'model_reasoning_effort=\"${effort}\"'`));
    assert.ok(command.includes("--model 'model-a'"));
    assert.ok(command.endsWith("< '/tmp/prompt file'"));
  }
  console.log("Codex catalog, storage, and command checks passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
