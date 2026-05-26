import { atom } from "jotai";
import {
  getTodoStorageAvailability,
  loadCurrentTodoSections,
  loadSearchableTodoSections,
  saveTodoEncryptionSecret,
  saveTodoSections,
} from "./storage";

export interface TodoSections {
  pinned: TodoItem[];
  todo: TodoItem[];
  completed: TodoItem[];
}

export interface TodoItem {
  id?: string;
  title: string;
  tag?: string;
  dueDate?: number;
  completed: boolean;
  completedAt?: number;
  deletedAt?: number;
  priority?: 1 | 2 | 3;
  timeAdded: number;
}

const todo = atom<TodoSections>(loadCurrentTodoSections());
const searchVersion = atom(0);

export const todoAtom = atom(
  (get) => get(todo),
  (get, set, newTodo: TodoSections) => {
    const updatedCurrent = saveTodoSections(get(todo), newTodo);
    // @ts-expect-error Jotai is confused
    set(todo, updatedCurrent);
    // @ts-expect-error Jotai is confused
    set(searchVersion, get(searchVersion) + 1);
  },
);

export const searchableTodoAtom = atom((get) => {
  get(searchVersion);
  return loadSearchableTodoSections();
});

export const todoStorageAvailabilityAtom = atom((get) => {
  get(searchVersion);
  return getTodoStorageAvailability();
});

export const todoEncryptionKeyAtom = atom(null, (get, set, encryptionKey: string) => {
  saveTodoEncryptionSecret(encryptionKey);
  const updatedCurrent = loadCurrentTodoSections();
  // @ts-expect-error Jotai is confused
  set(todo, updatedCurrent);
  // @ts-expect-error Jotai is confused
  set(searchVersion, get(searchVersion) + 1);
});

export const searchModeAtom = atom(false);

export const searchBarTextAtom = atom("");
export const newTodoTextAtom = atom((get) => get(searchBarTextAtom).trim());
export const editingTagNameAtom = atom("");
export const editingDueDateValueAtom = atom(0);
export const editingAtom = atom<
  | false
  | {
      sectionKey: keyof TodoSections;
      index: number;
    }
>(false);
export const editingTagAtom = atom<
  | false
  | {
      sectionKey: keyof TodoSections;
      index: number;
    }
>(false);
export const editingDueDateAtom = atom<
  | false
  | {
      sectionKey: keyof TodoSections;
      index: number;
    }
>(false);

export const ALL_TAG_VALUE = "All";
export const selectedTagAtom = atom(ALL_TAG_VALUE);
