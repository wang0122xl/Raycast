/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Todo Encryption Key - Used to encrypt todo data on disk. Keep this key safe; changing it requires the original key to read existing todos. */
  "encryptionKey": string,
  /** Completed tasks in Menu Bar - Show only 3 latest completed tasks, or show/hide all. */
  "completed": "latest" | "show_all" | "hide_all",
  /** Task sorting - The order in which task are sorted. */
  "sortOrder": "creation_date_ascending" | "creation_date_descending" | "title_ascending" | "title_descending",
  /** Natural language parsing - Automatically parse dates and tags */
  "nlpParsing": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `index` command */
  export type Index = ExtensionPreferences & {}
  /** Preferences accessible in the `menu_bar` command */
  export type MenuBar = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `index` command */
  export type Index = {}
  /** Arguments passed to the `menu_bar` command */
  export type MenuBar = {}
}

