/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `git-push` command */
  export type GitPush = ExtensionPreferences & {}
  /** Preferences accessible in the `create-pr` command */
  export type CreatePr = ExtensionPreferences & {}
  /** Preferences accessible in the `manage-folders` command */
  export type ManageFolders = ExtensionPreferences & {}
  /** Preferences accessible in the `manage-model` command */
  export type ManageModel = ExtensionPreferences & {}
  /** Preferences accessible in the `review-pr` command */
  export type ReviewPr = ExtensionPreferences & {}
  /** Preferences accessible in the `view-tasks` command */
  export type ViewTasks = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `git-push` command */
  export type GitPush = {}
  /** Arguments passed to the `create-pr` command */
  export type CreatePr = {}
  /** Arguments passed to the `manage-folders` command */
  export type ManageFolders = {}
  /** Arguments passed to the `manage-model` command */
  export type ManageModel = {}
  /** Arguments passed to the `review-pr` command */
  export type ReviewPr = {}
  /** Arguments passed to the `view-tasks` command */
  export type ViewTasks = {}
}

