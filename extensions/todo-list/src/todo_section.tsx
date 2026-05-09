import { List } from "@raycast/api";
import { useAtom } from "jotai";
import { ALL_TAG_VALUE, todoAtom, TodoItem, TodoSections } from "./atoms";
import { SECTIONS_DATA } from "./config";
import SingleTodoItem from "./todo_item";
import { sortTodoItem } from "./utils";

const TodoSection = ({
  sectionKey,
  selectedTag,
  title,
  items,
}: {
  sectionKey: keyof TodoSections;
  selectedTag: string;
  title?: string;
  items?: TodoItem[];
}) => {
  const [todoSections] = useAtom(todoAtom);
  const sectionItems = items ?? todoSections[sectionKey];
  const renderedItems = items ? sectionItems : sectionItems.slice().sort(sortTodoItem);

  return (
    <List.Section title={title ?? SECTIONS_DATA[sectionKey].name}>
      {renderedItems.map((item, i) =>
        selectedTag == item.tag || selectedTag == ALL_TAG_VALUE ? (
          <SingleTodoItem idx={i} item={item} key={item.id ?? i} sectionKey={sectionKey} />
        ) : null,
      )}
    </List.Section>
  );
};
export default TodoSection;
