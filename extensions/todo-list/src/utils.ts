import { TodoItem } from "./atoms";
import { preferences, priorityShortInputs } from "./config";
import * as chrono from "chrono-node";
import dayjs from "dayjs";

export const compare = (a: TodoItem, b: TodoItem) => {
  if (a.completed && !b.completed) return 1;
  if (b.completed && !a.completed) return -1;
  if (a.timeAdded < b.timeAdded) return -1;
  return 1;
};

export const insertIntoSection = (
  currentSection: TodoItem[],
  newItem: TodoItem,
  cmp: (a: TodoItem, b: TodoItem) => number,
) => {
  let low = -1;
  let high = currentSection.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (cmp(newItem, currentSection[mid]) < 0) {
      high = mid - 1;
    } else {
      low = mid;
    }
  }
  currentSection.splice(low + 1, 0, newItem);
  return currentSection;
};

function sortCompletedByCompletedAt(a: TodoItem, b: TodoItem) {
  const completedDiff = (b.completedAt ?? b.timeAdded) - (a.completedAt ?? a.timeAdded);
  if (completedDiff !== 0) return completedDiff;
  return b.timeAdded - a.timeAdded;
}

export function sortTodoItem(a: TodoItem, b: TodoItem) {
  const { sortOrder } = preferences;
  if (a.completed && b.completed) {
    return sortCompletedByCompletedAt(a, b);
  }
  if ((a.priority || b.priority) && a.priority != b.priority) {
    return (b.priority ?? 0) - (a.priority ?? 0);
  }
  if ((a.dueDate || b.dueDate) && a.dueDate != b.dueDate) {
    return (a.dueDate ?? 0) - (b.dueDate ?? 0);
  }
  switch (sortOrder) {
    case "title_ascending":
      return a.title.localeCompare(b.title, undefined, { sensitivity: "accent" });
    case "title_descending":
      return -a.title.localeCompare(b.title, undefined, { sensitivity: "accent" });
    case "creation_date_ascending":
      return a.timeAdded - b.timeAdded;
    default:
      return b.timeAdded - a.timeAdded;
  }
}

export function formatCompactDate(timestamp: number) {
  const inputDate = dayjs(timestamp);
  const format = inputDate.year() === dayjs().year() ? "MM-DD" : "YYYY-MM-DD";
  return inputDate.format(format);
}

export function formatFullDate(timestamp: number) {
  return dayjs(timestamp).format("YYYY-MM-DD");
}

export function sortSearchTodoItem(a: TodoItem, b: TodoItem) {
  if (!a.completed && b.completed) return -1;
  if (a.completed && !b.completed) return 1;
  if (!a.completed && !b.completed) return b.timeAdded - a.timeAdded;

  return sortCompletedByCompletedAt(a, b);
}

function searchableDateParts(timestamp?: number) {
  if (!timestamp) return [];
  return [formatFullDate(timestamp), formatCompactDate(timestamp), String(dayjs(timestamp).year())];
}

export function todoMatchesSearch(item: TodoItem, query: string) {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) return true;

  const haystack = [
    item.title,
    item.tag,
    ...searchableDateParts(item.timeAdded),
    ...searchableDateParts(item.dueDate),
    ...searchableDateParts(item.completedAt),
    ...searchableDateParts(item.deletedAt),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

function removeMultipleSpaces(s: string) {
  return s.replace(/\s+/g, " ");
}

function parseDueDate(todoItem: TodoItem): TodoItem {
  const dates = chrono.parse(todoItem.title, new Date(), { forwardDate: true });
  if (dates.length === 0) {
    return todoItem;
  }
  const dueDate = dates[0].date().getTime();
  const title = removeMultipleSpaces(todoItem.title.replace(dates[0].text, ""));
  return { ...todoItem, title, dueDate };
}

function parseTag(todoItem: TodoItem): TodoItem {
  const pieces = todoItem.title.split(" ");
  const tagIndex = pieces.findIndex((p) => p.startsWith("#"));
  if (tagIndex < 0) {
    return todoItem;
  }

  const tag = pieces[tagIndex];
  const title = removeMultipleSpaces(todoItem.title.replace(tag, ""));

  return {
    ...todoItem,
    title,
    tag,
  };
}

function parsePriority(todoItem: TodoItem): TodoItem {
  const pieces = todoItem.title.split(" ");
  const priorityIndex = pieces.findIndex((p) => p.startsWith("!"));
  if (priorityIndex < 0) {
    return todoItem;
  }

  const priorityShortInput = pieces[priorityIndex];
  const priority: 1 | 2 | 3 = priorityShortInputs[priorityShortInput];
  if (!priority) {
    return todoItem;
  }

  const title = removeMultipleSpaces(todoItem.title.replace(priorityShortInput, ""));
  return {
    ...todoItem,
    title,
    priority,
  };
}

export function parseTodoItem(itemText: string): TodoItem {
  const { nlpParsing } = preferences;

  let item: TodoItem = {
    title: itemText,
    completed: false,
    timeAdded: Date.now(),
  };

  if (!nlpParsing) {
    return item;
  }

  item = parseDueDate(item);
  item = parseTag(item);
  item = parsePriority(item);
  return item;
}
