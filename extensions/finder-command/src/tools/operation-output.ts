export interface AffectedPath {
  path: string;
  target?: string;
}

export function formatOperationMessage(input: {
  operation: string;
  affectedPaths: AffectedPath[];
  summary?: string;
}) {
  const affectedText =
    input.affectedPaths.length > 0
      ? input.affectedPaths
          .map((item) =>
            item.target ? `- ${item.path} -> ${item.target}` : `- ${item.path}`,
          )
          .join("\n")
      : "- None";

  return [
    `操作：${input.operation}`,
    input.summary ? `结果：${input.summary}` : undefined,
    "受影响路径：",
    affectedText,
  ]
    .filter(Boolean)
    .join("\n");
}
