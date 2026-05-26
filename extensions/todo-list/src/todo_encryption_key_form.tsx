import { Action, ActionPanel, Form, showToast, Toast, useNavigation } from "@raycast/api";
import { useAtom } from "jotai";
import { todoEncryptionKeyAtom } from "./atoms";

type Values = {
  encryptionKey: string;
};

export default function TodoEncryptionKeyForm() {
  const [, setEncryptionKey] = useAtom(todoEncryptionKeyAtom);
  const { pop } = useNavigation();

  const submit = async (values: Values) => {
    try {
      setEncryptionKey(values.encryptionKey);
      await showToast(Toast.Style.Success, "Encryption key saved");
      pop();
    } catch (error) {
      await showToast(
        Toast.Style.Failure,
        "Unable to use encryption key",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm onSubmit={submit} title="Save Encryption Key" />
        </ActionPanel>
      }
      navigationTitle="Set Todo Encryption Key"
    >
      <Form.PasswordField
        autoFocus
        id="encryptionKey"
        placeholder="Enter the todo encryption key"
        title="Encryption Key"
      />
    </Form>
  );
}
