const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadModule(name, mocks) {
  const filename = join(
    __dirname,
    "../src",
    name.includes(".") ? name : `${name}.ts`,
  );
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
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
    },
    { filename },
  );
  return module.exports;
}

const items = new Map();
const storageMocks = {
  "@raycast/api": {
    LocalStorage: {
      getItem: async (key) => items.get(key),
      setItem: async (key, value) => items.set(key, value),
      removeItem: async (key) => items.delete(key),
    },
  },
};

(async () => {
  const storage = loadModule("storage", storageMocks);
  const repo = "/repos/project one";
  const otherRepo = "/repos/project two";
  const commands = ["git-push", "create-pr", "review-pr"];
  const files = new Map();

  for (const command of commands) {
    const root = `/skills/root/${command}.md`;
    const custom = `/skills/custom/${command}.md`;
    files.set(root, `Root instructions for ${command}`);
    files.set(custom, `Repository instructions for ${command}`);
    assert.equal(await storage.getSkillPath(command, repo), null);
    await storage.setSkillPath(command, root);
    await storage.setSkillPath(command, custom, `${repo}/`);
    assert.equal(await storage.getSkillPath(command), root);
    assert.equal(await storage.getSkillPath(command, repo), custom);
    assert.equal(await storage.getSkillPath(command, `${repo}/./`), custom);
    assert.equal(await storage.getSkillPath(command, otherRepo), root);
    assert.equal(await storage.getSkillPath(command, `${repo}/nested`), root);
  }

  // Reload the module to prove bindings live in LocalStorage, not module state.
  const reloaded = loadModule("storage", storageMocks);
  for (const command of commands) {
    assert.equal(
      await reloaded.getSkillPath(command, repo),
      `/skills/custom/${command}.md`,
    );
  }
  await storage.removeSkillPath("git-push");
  assert.equal(
    await storage.getSkillPath("git-push", repo),
    "/skills/custom/git-push.md",
  );
  assert.equal(await storage.getSkillPath("git-push", otherRepo), null);
  assert.equal(
    await storage.getSkillPath("create-pr", repo),
    "/skills/custom/create-pr.md",
  );

  const spawns = [];
  const { getSkillOptionsForCommand, launchTask } = loadModule("task-manager", {
    "@raycast/api": {},
    "./storage": reloaded,
    "./git-utils": { dirFromPath: dirname },
    fs: {
      existsSync: (path) => files.has(path),
      mkdirSync: () => {},
      readdirSync: () => [],
      readFileSync: (path) => {
        assert.ok(files.has(path), `Unexpected file read: ${path}`);
        return files.get(path);
      },
      writeFileSync: (path, content) => files.set(path, content),
    },
    child_process: {
      execFileSync: (command) => {
        assert.equal(command, "git");
        return "main\n";
      },
      spawn: (command, args, options) => {
        assert.equal(command, "/bin/bash");
        spawns.push({ args, options });
        const child = new EventEmitter();
        child.pid = 1234;
        child.unref = () => {};
        return child;
      },
    },
  });

  for (const command of commands) {
    const options = await getSkillOptionsForCommand(command, repo);
    assert.equal(options.skillPath, `/skills/custom/${command}.md`);
    assert.equal(options.skillDir, "/skills/custom");
    assert.equal(options.skillName, command);

    // Simulate existing callers passing a root skill cached before selection.
    const staleOptions = {
      skillPath: `/skills/root/${command}.md`,
      skillName: command,
      skillDir: "/skills/root",
      agent: "codex",
      targetBranch: "main",
      prUrl: "https://github.com/example/repo/pull/1",
    };
    const task = await launchTask(command, repo, command, staleOptions);
    assert.ok(task);
    assert.equal(task.agent, "codex");
    assert.equal(task.targetBranch, "main");
    assert.equal(task.prUrl, staleOptions.prUrl);
    assert.ok(
      files
        .get(task.outputFile.replace(/\.log$/, ".prompt"))
        .includes(`Repository instructions for ${command}`),
    );
    assert.equal(spawns.at(-1).options.cwd, repo);

    await storage.setSkillPath(command, `/skills/root/${command}.md`);
    const fallbackTask = await launchTask(
      command,
      otherRepo,
      command,
      staleOptions,
    );
    assert.ok(
      files
        .get(fallbackTask.outputFile.replace(/\.log$/, ".prompt"))
        .includes(`Root instructions for ${command}`),
    );
  }

  await storage.removeSkillPath("review-pr");
  const spawnCount = spawns.length;
  assert.equal(
    await launchTask("review-pr", otherRepo, "review-pr", {
      skillPath: "/skills/root/review-pr.md",
      skillName: "review-pr",
      skillDir: "/skills/root",
    }),
    null,
  );
  assert.equal(spawns.length, spawnCount);
  // Exercise the picker actions with mocked native dialogs and navigation.
  items.clear();
  const pages = [];
  const dialogResults = [];
  const prompts = [];
  const api = {
    Action: () => {},
    ActionPanel: () => {},
    Icon: {},
    List: Object.assign(() => {}, {
      EmptyView: () => {},
      Section: () => {},
      Item: () => {},
    }),
    Toast: { Style: { Success: "success", Failure: "failure" } },
    showToast: async () => {},
    useNavigation: () => ({
      push: (page) => pages.push(page),
      pop: () => pages.pop(),
    }),
  };
  const { SkillRepoPicker, pickSkillFile } = loadModule("skill-picker.tsx", {
    "@raycast/api": api,
    "./storage": storage,
    "./repo-picker": { RepoPicker: () => {} },
    "./git-utils": { dirFromPath: dirname },
    "./task-manager": {
      skillPathToName: (path) => path.split("/").pop().replace(/\.md$/, ""),
    },
    child_process: {
      execFileSync: (_command, args) => {
        prompts.push(args[2]);
        return dialogResults.shift() ?? "";
      },
    },
  });
  const selected = [];
  const picker = SkillRepoPicker({
    command: "git-push",
    primaryActionTitle: "Git Push",
    onSelect: (dirPath, config) => selected.push({ dirPath, config }),
  });
  await storage.setSkillPath("git-push", "/skills/custom/git-push.md", repo);
  await picker.props.onSelect(repo);
  assert.equal(selected[0].config.skillPath, "/skills/custom/git-push.md");
  assert.equal(
    pages.length,
    0,
    "Repository-only skills must not prompt for a root skill",
  );
  await picker.props.onSelect(otherRepo);
  assert.equal(pages.length, 1);
  const prompt = pages[0].type(pages[0].props);
  const selectSkill =
    prompt.props.children.props.actions.props.children.props.onAction;
  await selectSkill();
  assert.equal(await storage.getSkillPath("git-push"), null);
  assert.equal(selected.length, 1);
  dialogResults.push("/skills/root/git-push.md");
  await selectSkill();
  assert.equal(
    await storage.getSkillPath("git-push"),
    "/skills/root/git-push.md",
  );
  assert.equal(selected[1].dirPath, otherRepo);
  assert.equal(pages.length, 0);

  const { default: ManageFolders } = loadModule("manage-folders.tsx", {
    "@raycast/api": api,
    react: {
      useState: (value) => [value, () => {}],
      useCallback: (callback) => callback,
      useEffect: () => {},
    },
    "./storage": storage,
    "./skill-picker": { pickSkillFile },
    "./git-utils": {},
    "./repo-picker": { RepoPicker: () => {} },
  });
  const skillRows = ManageFolders().props.children[1].props.children;
  for (const [index, command] of commands.entries()) {
    const action = skillRows[index].props.actions.props.children.find(
      (child) => child?.props?.title === "自定义目标",
    );
    assert.equal(action.props.shortcut.key, "e");
    assert.deepEqual(Array.from(action.props.shortcut.modifiers), ["cmd"]);
    const before = Array.from(items);
    action.props.onAction();
    assert.deepEqual(
      Array.from(items),
      before,
      "Opening the repository picker must not save a binding",
    );
    const repoPicker = pages.at(-1);
    await repoPicker.props.onSelect(otherRepo);
    assert.deepEqual(
      Array.from(items),
      before,
      "Canceling the skill dialog must preserve configuration",
    );
    dialogResults.push(`/skills/custom/${command}.md`);
    await repoPicker.props.onSelect(otherRepo);
    assert.equal(
      await storage.getSkillPath(command, otherRepo),
      `/skills/custom/${command}.md`,
    );
    assert.ok(prompts.at(-1).includes(otherRepo));
    assert.equal(pages.length, 0);
  }
  assert.equal(
    await storage.getSkillPath("git-push"),
    "/skills/root/git-push.md",
  );
  console.log(
    "Repository skill persistence, fallback, launch, and picker checks passed",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
