import {
  Clipboard,
  getSelectedText,
  showToast,
  Toast,
  ActionPanel,
  Action,
  Detail,
  closeMainWindow,
  PopToRootType,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { generateQRCode, getQRCodePath, copyQRCodeToClipboard } from "./utils";
import fs from "fs";

export default function Common({ from }: { from: "clipboard" | "selection" }) {
  const [qrData, setQrData] = useState<string>();
  const [sourceText, setSourceText] = useState<string>("");

  useEffect(() => {
    (async () => {
      const currentText = from === "clipboard" ? await Clipboard.readText() : await getSelectedText();

      setSourceText(currentText || "");

      if (!currentText?.trim()) {
        const errorText =
          from === "clipboard" ? "No text found in clipboard" : "You need to select an URL to generate the qrcode";
        await showToast(Toast.Style.Failure, "Failed", errorText);
        return;
      }

      const qrData = await generateQRCode({ URL: currentText, preview: true });
      setQrData(qrData);

      showToast(Toast.Style.Success, "Create Success", currentText);
    })();
  }, []);

  async function saveQRCodeToDownloads() {
    if (!qrData) return false;
    try {
      // qrData is a data URL: data:image/png;base64,...
      const base64 = qrData.split(",")[1];
      const buffer = Buffer.from(base64, "base64");
      const filePath = getQRCodePath(sourceText, "png");
      fs.writeFileSync(filePath, buffer);
      await showToast(Toast.Style.Success, "Saved to Downloads", filePath);
      return true;
    } catch (error) {
      await showToast(Toast.Style.Failure, "Failed to Save", error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async function handleSave() {
    await saveQRCodeToDownloads();
  }

  async function handleCopy() {
    if (!sourceText) return;
    await copyQRCodeToClipboard({ url: sourceText, format: "png-bg" });
  }

  async function closeRaycastPanel() {
    await closeMainWindow({ clearRootSearch: true, popToRootType: PopToRootType.Immediate });
  }

  async function handleCopyAndClose() {
    await handleCopy();
    await closeRaycastPanel();
  }

  async function handleCopySaveAndClose() {
    await handleCopy();
    const didSave = await saveQRCodeToDownloads();
    if (didSave) {
      await closeRaycastPanel();
    }
  }

  const actions =
    from === "clipboard" ? (
      <ActionPanel>
        <Action title="Copy and Close" onAction={handleCopyAndClose} />
        <Action
          title="Copy, Save, and Close"
          onAction={handleCopySaveAndClose}
          shortcut={{ modifiers: ["cmd"], key: "enter" }}
        />
        <Action title="Save to Downloads" onAction={handleSave} shortcut={{ modifiers: ["cmd"], key: "s" }} />
      </ActionPanel>
    ) : (
      <ActionPanel>
        <Action title="Save to Downloads" onAction={handleSave} shortcut={{ modifiers: ["cmd"], key: "s" }} />
        <Action title="Copy to Clipboard" onAction={handleCopy} shortcut={{ modifiers: ["cmd"], key: "c" }} />
      </ActionPanel>
    );

  return <Detail isLoading={!qrData} markdown={`![qrcode](${qrData || ""}?raycast-height=350)`} actions={actions} />;
}
