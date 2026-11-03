import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import { getCodexModels, type CodexModelInfo } from "./codex-models";
import {
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_REASONING_EFFORT,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_MODEL,
  DEFAULT_MODEL_COMMAND,
  DEFAULT_OPENCODE_MODEL,
  getClaudeModelForCommand,
  getCodexModelForCommand,
  getCodexReasoningEffortForCommand,
  getGeminiModelForCommand,
  getModelCommand,
  getOpenCodeModelForCommand,
  setClaudeModelForCommand,
  setCodexModelForCommand,
  setCodexReasoningEffortForCommand,
  setGeminiModelForCommand,
  setModelCommand,
  setOpenCodeModelForCommand,
  type ClaudeModel,
  type CodexModel,
  type GeminiModel,
  type OpenCodeModel,
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

interface OpenCodeModelFormProps {
  commandTitle: string;
  currentModel: OpenCodeModel;
  onSubmit: (model: OpenCodeModel) => Promise<void>;
}

interface OpenCodeModelFormValues {
  model: string;
}

function OpenCodeModelForm({
  commandTitle,
  currentModel,
  onSubmit,
}: OpenCodeModelFormProps) {
  const { pop } = useNavigation();

  async function handleSubmit(values: OpenCodeModelFormValues) {
    const model = values.model.trim();
    if (!model) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Model Required",
        message: "Enter provider/model or provider/model#variant",
      });
      return;
    }

    await onSubmit(model);
    pop();
  }

  return (
    <Form
      navigationTitle={`OpenCode Model: ${commandTitle}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Model"
            icon={Icon.Check}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="model"
        title="Model"
        placeholder="provider/model or provider/model#variant"
        info="A model without a variant uses #high."
        defaultValue={currentModel}
      />
    </Form>
  );
}

export default function ManageModel() {
  const [selectedCommand, setSelectedCommand] = useState<SkillCommand>(
    DEFAULT_MODEL_COMMAND,
  );
  const [selectedModel, setSelectedModel] =
    useState<ClaudeModel>(DEFAULT_MODEL);
  const [selectedCodexModel, setSelectedCodexModel] =
    useState<CodexModel>(DEFAULT_CODEX_MODEL);
  const [selectedCodexReasoningEffort, setSelectedCodexReasoningEffort] =
    useState(DEFAULT_CODEX_REASONING_EFFORT);
  const [codexModels, setCodexModels] = useState<CodexModelInfo[]>([]);
  const [isLoadingCodexModels, setIsLoadingCodexModels] = useState(true);
  const [codexModelsError, setCodexModelsError] = useState<string>();
  const [selectedGeminiModel, setSelectedGeminiModel] =
    useState<GeminiModel>(DEFAULT_GEMINI_MODEL);
  const [selectedOpenCodeModel, setSelectedOpenCodeModel] =
    useState<OpenCodeModel>(DEFAULT_OPENCODE_MODEL);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(
    async (command = selectedCommand) => {
      const [
        claudeModel,
        codexModel,
        geminiModel,
        openCodeModel,
        codexReasoningEffort,
      ] = await Promise.all([
        getClaudeModelForCommand(command),
        getCodexModelForCommand(command),
        getGeminiModelForCommand(command),
        getOpenCodeModelForCommand(command),
        getCodexReasoningEffortForCommand(command),
      ]);
      setSelectedModel(claudeModel);
      setSelectedCodexModel(codexModel);
      setSelectedCodexReasoningEffort(codexReasoningEffort);
      setSelectedGeminiModel(geminiModel);
      setSelectedOpenCodeModel(openCodeModel);
      setIsLoading(false);
    },
    [selectedCommand],
  );

  const refreshCodexModels = useCallback(async () => {
    setIsLoadingCodexModels(true);
    setCodexModelsError(undefined);
    try {
      setCodexModels(await getCodexModels());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCodexModelsError(message);
      await showToast({
        style: Toast.Style.Failure,
        title: "Could Not Load Codex Models",
        message,
      });
    } finally {
      setIsLoadingCodexModels(false);
    }
  }, []);

  useEffect(() => {
    void refreshCodexModels();
  }, [refreshCodexModels]);

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

  async function handleSelectCodex(model: CodexModelInfo, effort: string) {
    try {
      await setCodexModelForCommand(selectedCommand, model.model);
      await setCodexReasoningEffortForCommand(selectedCommand, effort);
      await refresh();
      await showToast({
        style: Toast.Style.Success,
        title: "Codex Model Updated",
        message: `${COMMAND_TITLES[selectedCommand]} uses ${model.model} (${effort})`,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Could Not Update Codex Model",
        message: error instanceof Error ? error.message : String(error),
      });
    }
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

  async function handleSelectOpenCode(model: OpenCodeModel) {
    await setOpenCodeModelForCommand(selectedCommand, model);
    await refresh();
    await showToast({
      style: Toast.Style.Success,
      title: "OpenCode Model Updated",
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
      isLoading={isLoading || isLoadingCodexModels}
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
        {codexModels.map((model) => (
          <List.Item
            key={model.id}
            icon={
              selectedCodexModel === model.model
                ? Icon.CheckCircle
                : Icon.Circle
            }
            title={`${model.displayName}${model.isDefault ? " (CLI Default)" : ""}`}
            subtitle={model.description}
            accessories={
              selectedCodexModel === model.model
                ? [{ text: selectedCodexReasoningEffort }, { text: "Selected" }]
                : []
            }
            actions={
              <ActionPanel>
                <Action
                  title="Select Model"
                  icon={Icon.Check}
                  onAction={() =>
                    handleSelectCodex(model, model.defaultReasoningEffort)
                  }
                />
                <ActionPanel.Submenu
                  title="Select Reasoning Effort"
                  icon={Icon.Gear}
                >
                  {model.supportedReasoningEfforts.map((effort) => (
                    <Action
                      key={effort.reasoningEffort}
                      title={`${effort.reasoningEffort}${effort.reasoningEffort === model.defaultReasoningEffort ? " (Default)" : ""}`}
                      icon={
                        selectedCodexModel === model.model &&
                        selectedCodexReasoningEffort === effort.reasoningEffort
                          ? Icon.CheckCircle
                          : Icon.Circle
                      }
                      onAction={() =>
                        handleSelectCodex(model, effort.reasoningEffort)
                      }
                    />
                  ))}
                </ActionPanel.Submenu>
              </ActionPanel>
            }
          />
        ))}
        {!isLoadingCodexModels &&
          !codexModelsError &&
          !codexModels.some((model) => model.model === selectedCodexModel) && (
            <List.Item
              icon={Icon.CheckCircle}
              title={selectedCodexModel}
              subtitle="Saved model is not listed by Codex CLI"
              accessories={[
                { text: selectedCodexReasoningEffort },
                { text: "Selected" },
              ]}
            />
          )}
        {(codexModelsError ||
          (!isLoadingCodexModels && codexModels.length === 0)) && (
          <List.Item
            icon={Icon.Warning}
            title={
              codexModelsError
                ? "Could Not Load Codex Models"
                : "No Codex Models Available"
            }
            subtitle={
              codexModelsError ?? "Check your Codex CLI login and configuration"
            }
            actions={
              <ActionPanel>
                <Action
                  title="Reload Codex Models"
                  icon={Icon.ArrowClockwise}
                  onAction={refreshCodexModels}
                />
              </ActionPanel>
            }
          />
        )}
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
      <List.Section
        title={`Select OpenCode Model for ${COMMAND_TITLES[selectedCommand]}`}
      >
        <List.Item
          icon={selectedOpenCodeModel ? Icon.CheckCircle : Icon.Circle}
          title="OpenCode Model"
          subtitle={selectedOpenCodeModel || "OpenCode CLI default"}
          accessories={selectedOpenCodeModel ? [{ text: "Selected" }] : []}
          actions={
            <ActionPanel>
              <Action.Push
                title="Select Model"
                icon={Icon.Pencil}
                target={
                  <OpenCodeModelForm
                    commandTitle={COMMAND_TITLES[selectedCommand]}
                    currentModel={selectedOpenCodeModel}
                    onSubmit={handleSelectOpenCode}
                  />
                }
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
