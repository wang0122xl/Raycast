import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import {
  DEFAULT_CODEX_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_MODEL,
  DEFAULT_MODEL_COMMAND,
  getClaudeModelForCommand,
  getCodexModelForCommand,
  getGeminiModelForCommand,
  getModelCommand,
  setClaudeModelForCommand,
  setCodexModelForCommand,
  setGeminiModelForCommand,
  setModelCommand,
  type ClaudeModel,
  type CodexModel,
  type GeminiModel,
  type SkillCommand,
} from "./storage";

const COMMANDS: { value: SkillCommand; title: string }[] = [
  { value: "git-push", title: "Git Push" },
  { value: "create-pr", title: "Create PR" },
  { value: "review-pr", title: "Review PR" },
];

const COMMAND_TITLES: Record<SkillCommand, string> = {
  "git-push": "Git Push",
  "create-pr": "Create PR",
  "review-pr": "Review PR",
};

const MODELS: { value: ClaudeModel; title: string; description: string }[] = [
  {
    value: "haiku",
    title: "Haiku",
    description: "Fast and efficient model for quick tasks",
  },
  {
    value: "sonnet",
    title: "Sonnet (Default)",
    description: "Balanced model for most development tasks",
  },
  {
    value: "opus",
    title: "Opus",
    description: "Most capable model for complex tasks",
  },
];

const CODEX_MODELS: {
  value: CodexModel;
  title: string;
  description: string;
}[] = [
  {
    value: "gpt-5.5",
    title: "GPT-5.5 (Default)",
    description: "Default model for Codex tasks",
  },
  {
    value: "gpt-5.4",
    title: "GPT-5.4",
    description: "Alternative Codex model",
  },
  {
    value: "gpt-5.3-codex",
    title: "GPT-5.3 Codex",
    description: "Codex-optimized GPT-5.3 model",
  },
];

const GEMINI_MODELS: {
  value: GeminiModel;
  title: string;
  description: string;
}[] = [
  {
    value: "gemini-3.1-pro-preview",
    title: "Gemini 3.1 Pro Preview (Default)",
    description: "Default model for Gemini tasks",
  },
  {
    value: "gemini-3-flash-preview",
    title: "Gemini 3 Flash Preview",
    description: "Faster Gemini 3 preview model",
  },
  {
    value: "gemini-3.1-flash-lite-preview",
    title: "Gemini 3.1 Flash Lite Preview",
    description: "Lightweight Gemini 3.1 preview model",
  },
];

export default function ManageModel() {
  const [selectedCommand, setSelectedCommand] = useState<SkillCommand>(
    DEFAULT_MODEL_COMMAND,
  );
  const [selectedModel, setSelectedModel] =
    useState<ClaudeModel>(DEFAULT_MODEL);
  const [selectedCodexModel, setSelectedCodexModel] =
    useState<CodexModel>(DEFAULT_CODEX_MODEL);
  const [selectedGeminiModel, setSelectedGeminiModel] =
    useState<GeminiModel>(DEFAULT_GEMINI_MODEL);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(
    async (command = selectedCommand) => {
      const [claudeModel, codexModel, geminiModel] = await Promise.all([
        getClaudeModelForCommand(command),
        getCodexModelForCommand(command),
        getGeminiModelForCommand(command),
      ]);
      setSelectedModel(claudeModel);
      setSelectedCodexModel(codexModel);
      setSelectedGeminiModel(geminiModel);
      setIsLoading(false);
    },
    [selectedCommand],
  );

  useEffect(() => {
    (async () => {
      const command = await getModelCommand();
      setSelectedCommand(command);
      await refresh(command);
    })();
  }, [refresh]);

  async function handleCommandChange(command: SkillCommand) {
    setIsLoading(true);
    setSelectedCommand(command);
    await setModelCommand(command);
    await refresh(command);
  }

  async function handleSelect(model: ClaudeModel) {
    await setClaudeModelForCommand(selectedCommand, model);
    await refresh();
    await showToast({
      style: Toast.Style.Success,
      title: "Claude Model Updated",
      message: `${COMMAND_TITLES[selectedCommand]} uses ${model}`,
    });
  }

  async function handleSelectCodex(model: CodexModel) {
    await setCodexModelForCommand(selectedCommand, model);
    await refresh();
    await showToast({
      style: Toast.Style.Success,
      title: "Codex Model Updated",
      message: `${COMMAND_TITLES[selectedCommand]} uses ${model}`,
    });
  }

  async function handleSelectGemini(model: GeminiModel) {
    await setGeminiModelForCommand(selectedCommand, model);
    await refresh();
    await showToast({
      style: Toast.Style.Success,
      title: "Gemini Model Updated",
      message: `${COMMAND_TITLES[selectedCommand]} uses ${model}`,
    });
  }

  const taskDropdown = (
    <List.Dropdown
      tooltip="Task Type"
      value={selectedCommand}
      onChange={(value) => handleCommandChange(value as SkillCommand)}
    >
      {COMMANDS.map((command) => (
        <List.Dropdown.Item
          key={command.value}
          title={command.title}
          value={command.value}
        />
      ))}
    </List.Dropdown>
  );

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`Manage Models: ${COMMAND_TITLES[selectedCommand]}`}
      searchBarAccessory={taskDropdown}
    >
      <List.Section
        title={`Select Claude Model for ${COMMAND_TITLES[selectedCommand]}`}
      >
        {MODELS.map((model) => (
          <List.Item
            key={model.value}
            icon={
              selectedModel === model.value ? Icon.CheckCircle : Icon.Circle
            }
            title={model.title}
            subtitle={model.description}
            accessories={
              selectedModel === model.value ? [{ text: "Selected" }] : []
            }
            actions={
              <ActionPanel>
                <Action
                  title="Select Model"
                  icon={Icon.Check}
                  onAction={() => handleSelect(model.value)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section
        title={`Select Codex Model for ${COMMAND_TITLES[selectedCommand]}`}
      >
        {CODEX_MODELS.map((model) => (
          <List.Item
            key={model.value}
            icon={
              selectedCodexModel === model.value
                ? Icon.CheckCircle
                : Icon.Circle
            }
            title={model.title}
            subtitle={model.description}
            accessories={
              selectedCodexModel === model.value ? [{ text: "Selected" }] : []
            }
            actions={
              <ActionPanel>
                <Action
                  title="Select Model"
                  icon={Icon.Check}
                  onAction={() => handleSelectCodex(model.value)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section
        title={`Select Gemini Model for ${COMMAND_TITLES[selectedCommand]}`}
      >
        {GEMINI_MODELS.map((model) => (
          <List.Item
            key={model.value}
            icon={
              selectedGeminiModel === model.value
                ? Icon.CheckCircle
                : Icon.Circle
            }
            title={model.title}
            subtitle={model.description}
            accessories={
              selectedGeminiModel === model.value ? [{ text: "Selected" }] : []
            }
            actions={
              <ActionPanel>
                <Action
                  title="Select Model"
                  icon={Icon.Check}
                  onAction={() => handleSelectGemini(model.value)}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
