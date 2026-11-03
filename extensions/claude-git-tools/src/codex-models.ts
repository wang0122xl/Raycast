import { spawn } from "child_process";
import { createInterface } from "readline";
import { EXTENDED_PATH } from "./git-utils";

const MODEL_LIST_TIMEOUT_MS = 20_000;

export interface CodexModelInfo {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden?: boolean;
  isDefault: boolean;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: {
    reasoningEffort: string;
    description: string;
  }[];
}

function isCodexModel(value: unknown): value is CodexModelInfo {
  if (!value || typeof value !== "object") return false;
  const model = value as Record<string, unknown>;
  return (
    typeof model.id === "string" &&
    typeof model.model === "string" &&
    model.model.length > 0 &&
    typeof model.displayName === "string" &&
    typeof model.description === "string" &&
    (model.hidden === undefined || typeof model.hidden === "boolean") &&
    typeof model.isDefault === "boolean" &&
    typeof model.defaultReasoningEffort === "string" &&
    Array.isArray(model.supportedReasoningEfforts) &&
    model.supportedReasoningEfforts.every(
      (effort: unknown) =>
        !!effort &&
        typeof effort === "object" &&
        "reasoningEffort" in effort &&
        typeof effort.reasoningEffort === "string" &&
        "description" in effort &&
        typeof effort.description === "string",
    )
  );
}

export function getCodexModels(): Promise<CodexModelInfo[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
      env: { ...process.env, PATH: EXTENDED_PATH },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = createInterface({ input: child.stdout });
    const models: CodexModelInfo[] = [];
    let requestId = 0;
    let finished = false;
    let stderr = "";
    const timer = setTimeout(
      () => finish(new Error("Codex model list timed out")),
      MODEL_LIST_TIMEOUT_MS,
    );

    function finish(error?: Error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      lines.close();
      child.kill("SIGKILL");
      if (error) reject(error);
      else resolve(models);
    }

    function send(message: object) {
      child.stdin.write(JSON.stringify(message) + "\n");
    }

    function listModels(cursor?: string) {
      send({
        id: ++requestId,
        method: "model/list",
        params: { limit: 100, includeHidden: false, cursor },
      });
    }

    child.stderr.on("data", (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-4_000);
    });
    child.on("error", finish);
    child.stdin.on("error", finish);
    child.on("close", (code) => {
      finish(new Error(stderr.trim() || `Codex CLI exited (${code})`));
    });
    lines.on("line", (line) => {
      if (finished) return;
      try {
        const message = JSON.parse(line) as {
          id?: number;
          error?: { message: string };
          result?: { data?: unknown; nextCursor?: unknown };
        };
        if (message.id !== requestId) return;
        if (message.error) throw new Error(message.error.message);
        if (!message.result) throw new Error("Invalid Codex CLI response");
        if (requestId === 0) {
          send({ method: "initialized" });
          listModels();
          return;
        }
        const { data, nextCursor } = message.result;
        if (
          !Array.isArray(data) ||
          !data.every(isCodexModel) ||
          (nextCursor != null && typeof nextCursor !== "string")
        ) {
          throw new Error("Invalid Codex model catalog");
        }
        models.push(...data.filter((model) => !model.hidden));
        if (nextCursor) listModels(nextCursor);
        else finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    send({
      id: requestId,
      method: "initialize",
      params: {
        clientInfo: {
          name: "raycast_claude_git_tools",
          title: "Raycast Claude Git Tools",
          version: "1.0.0",
        },
        capabilities: null,
      },
    });
  });
}
