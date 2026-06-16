/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Work Start Time - 24-hour time in HH:mm format, for example 09:00. */
  "workStartTime": string,
  /** Lunch Start Time - 24-hour time in HH:mm format, for example 12:00. */
  "lunchStartTime": string,
  /** Lunch End Time - 24-hour time in HH:mm format, for example 13:00. */
  "lunchEndTime": string,
  /** Offwork Time - 24-hour time in HH:mm format, for example 18:30. */
  "offworkTime": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `offwork-remider` command */
  export type OffworkRemider = ExtensionPreferences & {}
  /** Preferences accessible in the `check-offwork` command */
  export type CheckOffwork = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `offwork-remider` command */
  export type OffworkRemider = {}
  /** Arguments passed to the `check-offwork` command */
  export type CheckOffwork = {}
}

