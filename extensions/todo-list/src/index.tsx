import { List } from "@raycast/api";
import {
  ALL_TAG_VALUE,
  editingAtom,
  searchableTodoAtom,
  selectedTagAtom,
  searchBarTextAtom,
  searchModeAtom,
  TodoItem,
} from "./atoms";
import { useAtom } from "jotai";
import TodoSection from "./todo_section";
import ListActions from "./list_actions";
import ListTags from "./list_tags";
import { useMemo } from "react";
import { sortSearchTodoItem, todoMatchesSearch } from "./utils";

function flattenTodos(sections: { pinned: TodoItem[]; todo: TodoItem[]; completed: TodoItem[] }) {
  return [...sections.pinned, ...sections.todo, ...sections.completed];
}

export default function TodoList() {
  const [searchMode] = useAtom(searchModeAtom);
  const [searchBarText, setSearchBarText] = useAtom(searchBarTextAtom);
  const [editing] = useAtom(editingAtom);
  const [selectedTag] = useAtom(selectedTagAtom);

  return (
    <List
      actions={<ListActions />}
      filtering={false}
      key={searchMode ? "search" : "nosearch"}
      navigationTitle={`Manage Todo List${editing !== false ? " • Editing" : searchMode ? " • Searching" : ""}`}
      onSearchTextChange={(text: string) => setSearchBarText(text)}
      searchBarAccessory={<ListTags />}
      searchBarPlaceholder={searchMode ? "Search todos" : "Type and hit enter to add an item to your list"}
      searchText={searchBarText}
    >
      {searchMode ? (
        <SearchTodoSections searchBarText={searchBarText} selectedTag={selectedTag} />
      ) : (
        <>
          <TodoSection sectionKey="pinned" selectedTag={selectedTag} />
          <TodoSection sectionKey="todo" selectedTag={selectedTag} />
          <TodoSection sectionKey="completed" selectedTag={selectedTag} />
        </>
      )}
    </List>
  );
}

function SearchTodoSections({ searchBarText, selectedTag }: { searchBarText: string; selectedTag: string }) {
  const [searchableTodos] = useAtom(searchableTodoAtom);

  const searchSections = useMemo(() => {
    const matchingTodos = flattenTodos(searchableTodos)
      .filter((item) => selectedTag === ALL_TAG_VALUE || selectedTag === item.tag)
      .filter((item) => todoMatchesSearch(item, searchBarText))
      .sort(sortSearchTodoItem);

    return {
      incomplete: matchingTodos.filter((item) => !item.completed),
      completed: matchingTodos.filter((item) => item.completed),
    };
  }, [searchBarText, searchableTodos, selectedTag]);

  return (
    <>
      <TodoSection items={searchSections.incomplete} sectionKey="todo" selectedTag={ALL_TAG_VALUE} title="Incomplete" />
      <TodoSection
        items={searchSections.completed}
        sectionKey="completed"
        selectedTag={ALL_TAG_VALUE}
        title="Completed"
      />
    </>
  );
}
