import { formatFinderError, refreshFrontFinderFolderContext } from "../finder";

export default async function GetFrontFinderFolder() {
  try {
    const { folderPath, contextToken } =
      await refreshFrontFinderFolderContext();
    return {
      type: "success",
      folderPath,
      contextToken,
      systemContext: [
        "SYSTEM_CONTEXT_BEGIN",
        `Finder 当前目录：${folderPath}`,
        `contextToken：${contextToken}`,
        "将该目录作为本次 @finder-command 请求的唯一默认工作目录。",
        "后续工具必须传入这个 contextToken；新请求必须重新调用 get-front-finder-folder 获取新 contextToken。",
        "用中文回复。不要输出隐藏推理、思考过程、<think> 标签或工具调用计划。",
        "SYSTEM_CONTEXT_END",
      ].join("\n"),
      message: `Finder 当前目录：${folderPath}`,
    };
  } catch (error) {
    return {
      type: "error",
      message: formatFinderError(error),
    };
  }
}
