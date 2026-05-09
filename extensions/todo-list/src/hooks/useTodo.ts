import {
  TodoItem,
  TodoSections,
  editingAtom,
  editingTagAtom,
  editingTagNameAtom,
  searchBarTextAtom,
  todoAtom,
  editingDueDateAtom,
  editingDueDateValueAtom,
} from "../atoms";
import { compare, insertIntoSection } from "../utils";

import _ from "lodash";
import { useAtom } from "jotai";

export const useTodo = ({ item, idx, sectionKey }: { item: TodoItem; idx: number; sectionKey: keyof TodoSections }) => {
  const [todoSections, setTodoSections] = useAtom(todoAtom);
  const [, setEditing] = useAtom(editingAtom);
  const [, setEditingTag] = useAtom(editingTagAtom);
  const [, setEditingTagName] = useAtom(editingTagNameAtom);
  const [, setEditingDueDate] = useAtom(editingDueDateAtom);
  const [, setEditingDueDateValue] = useAtom(editingDueDateValueAtom);
  const [, setSearchBarText] = useAtom(searchBarTextAtom);

  const setClone = () => {
    setTodoSections(_.cloneDeep(todoSections));
  };

  const findCurrentItem = () => {
    if (item.id) {
      const keys = Object.keys(todoSections) as (keyof TodoSections)[];
      for (const key of keys) {
        const index = todoSections[key].findIndex((todo) => todo.id === item.id);
        if (index >= 0) return { sectionKey: key, index, item: todoSections[key][index] };
      }
    }

    const fallbackItem = todoSections[sectionKey][idx];
    if (!fallbackItem) return undefined;
    return { sectionKey, index: idx, item: fallbackItem };
  };

  const toggleCompleted = (completed: boolean) => {
    const current = findCurrentItem();
    if (!current) return;

    current.item.completed = completed;
    current.item.completedAt = completed ? Date.now() : undefined;
    todoSections[current.sectionKey].splice(current.index, 1);
    todoSections[current.sectionKey] = [...insertIntoSection(todoSections[current.sectionKey], current.item, compare)];
    setClone();
  };

  const moveToSection = (newSection: keyof TodoSections) => {
    const current = findCurrentItem();
    if (!current) return;
    const currentItem = current.item;

    if (newSection === "completed") {
      currentItem.completed = true;
      currentItem.completedAt = Date.now();
    } else if (newSection === "todo") {
      currentItem.completed = false;
      currentItem.completedAt = undefined;
    }
    todoSections[newSection] = [...insertIntoSection(todoSections[newSection], currentItem, compare)];
    todoSections[current.sectionKey].splice(current.index, 1);
    setClone();
  };

  const unPin = () => {
    moveToSection(item.completed ? "completed" : "todo");
  };
  const pin = () => {
    moveToSection("pinned");
  };

  // don't change section if pinned
  const markCompleted = () => {
    if (sectionKey === "pinned") {
      toggleCompleted(true);
    } else {
      moveToSection("completed");
    }
  };

  // don't change section if pinned
  const markTodo = () => {
    if (sectionKey === "pinned") {
      toggleCompleted(false);
    } else {
      moveToSection("todo");
    }
  };

  const toggleTodo = () => {
    if (item.completed) markTodo();
    else markCompleted();
  };

  const deleteTodo = () => {
    const current = findCurrentItem();
    if (!current) return;
    todoSections[current.sectionKey].splice(current.index, 1);
    setClone();
  };

  const editTodo = () => {
    const current = findCurrentItem();
    if (!current) return;
    setEditing({
      sectionKey: current.sectionKey,
      index: current.index,
    });
    setSearchBarText(current.item.title);
  };

  const editTodoTag = () => {
    const current = findCurrentItem();
    if (!current) return;
    setEditingTag({
      sectionKey: current.sectionKey,
      index: current.index,
    });
    setEditingTagName(current.item.tag ?? "");
  };

  const editTodoDueDate = () => {
    const current = findCurrentItem();
    if (!current) return;
    setEditingDueDate({
      sectionKey: current.sectionKey,
      index: current.index,
    });
    setEditingDueDateValue(current.item.dueDate ?? 0);
  };

  const setPriority = (priority?: 1 | 2 | 3) => {
    const current = findCurrentItem();
    if (!current) return;
    current.item.priority = priority;
    setClone();
  };

  return {
    editTodo,
    editTodoTag,
    editTodoDueDate,
    deleteTodo,
    markTodo,
    markCompleted,
    pin,
    unPin,
    toggleCompleted,
    toggleTodo,
    setPriority,
  };
};
