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
  getCodexModel,
  getGeminiModel,
  getModel,
  setCodexModel,
  setGeminiModel,
  setModel,
  type ClaudeModel,
  type CodexModel,
  type GeminiModel,
} from "./storage";

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
  const [selectedModel, setSelectedModel] = useState<ClaudeModel>("sonnet");
  const [selectedCodexModel, setSelectedCodexModel] =
    useState<CodexModel>("gpt-5.5");
  const [selectedGeminiModel, setSelectedGeminiModel] = useState<GeminiModel>(
    "gemini-3.1-pro-preview",
  );
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [claudeModel, codexModel, geminiModel] = await Promise.all([
      getModel(),
      getCodexModel(),
      getGeminiModel(),
    ]);
    setSelectedModel(claudeModel);
    setSelectedCodexModel(codexModel);
    setSelectedGeminiModel(geminiModel);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSelect(model: ClaudeModel) {
    await setModel(model);
    await refresh();
    await showToast({
      style: Toast.Style.Success,
      title: "Model Updated",
      message: `Now using ${model}`,
    });
  }

  async function handleSelectCodex(model: CodexModel) {
    await setCodexModel(model);
    await refresh();
    await showToast({
      style: Toast.Style.Success,
      title: "Codex Model Updated",
      message: `Now using ${model}`,
    });
  }

  async function handleSelectGemini(model: GeminiModel) {
    await setGeminiModel(model);
    await refresh();
    await showToast({
      style: Toast.Style.Success,
      title: "Gemini Model Updated",
      message: `Now using ${model}`,
    });
  }

  return (
    <List isLoading={isLoading}>
      <List.Section title="Select Claude Model">
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
      <List.Section title="Select Codex Model">
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
      <List.Section title="Select Gemini Model">
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
