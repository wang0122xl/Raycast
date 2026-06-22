import { formatFinderError, refreshFrontFinderFolderContext } from "../finder";
import { formatOperationMessage } from "./operation-output";

export default async function GetFrontFinderFolder() {
  try {
    const { folderPath, contextToken } =
      await refreshFrontFinderFolderContext();
    return {
      type: "success",
      operation: "get-front-finder-folder",
      folderPath,
      contextToken,
      affectedPaths: [{ path: folderPath }],
      systemContext: [
        "SYSTEM_CONTEXT_BEGIN",
        `Finder 当前目录：${folderPath}`,
        `contextToken：${contextToken}`,
        "将该目录作为本次 @finder-command 请求的唯一默认工作目录。",
        "后续工具优先传入这个 contextToken；如果 Raycast beta 未能附带，工具会使用本次刚锁定的目录上下文。",
        "新请求必须重新调用 get-front-finder-folder 获取新 contextToken。",
        "用中文回复。不要输出隐藏推理、思考过程、<think> 标签或工具调用计划。",
        "SYSTEM_CONTEXT_END",
      ].join("\n"),
      message: formatOperationMessage({
        operation: "锁定 Finder 当前目录 (get-front-finder-folder)",
        summary: "已锁定本次请求的默认工作目录",
        affectedPaths: [{ path: folderPath }],
      }),
    };
  } catch (error) {
    return {
      type: "error",
      message: formatFinderError(error),
    };
  }
}
