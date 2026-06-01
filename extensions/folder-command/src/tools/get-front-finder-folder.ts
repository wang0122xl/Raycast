import { formatFinderError, getFrontFinderFolderPath } from "../finder";

export default async function GetFrontFinderFolder() {
  try {
    const folderPath = await getFrontFinderFolderPath();
    return {
      type: "success",
      folderPath,
      systemContext: [
        "SYSTEM_CONTEXT_BEGIN",
        `Finder 当前目录：${folderPath}`,
        "将该目录作为本次 @folder-command 请求的唯一默认工作目录。",
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
