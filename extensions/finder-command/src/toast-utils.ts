import { showToast, Toast } from "@raycast/api";

async function showTaskToast(
  style: Toast.Style,
  title: string,
  message?: string,
) {
  try {
    await showToast({ style, title, message });
  } catch {
    // Toast delivery should not change the tool result.
  }
}

export async function showTaskSuccess(title: string, message?: string) {
  await showTaskToast(Toast.Style.Success, title, message);
}

export async function showTaskFailure(title: string, message?: string) {
  await showTaskToast(Toast.Style.Failure, title, message);
}
