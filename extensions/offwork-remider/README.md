# Offwork Reminder

Raycast extension for Chinese workday offwork reminders.

## Usage

1. Configure `Offwork Time` in extension preferences using `HH:mm`, for example `18:00`.
2. Open `Offwork Reminder` to see today's countdown.
3. Run `距下班还剩` once, or enable its background refresh in Raycast preferences, so Root Search can show the latest countdown and the reminder can run automatically.

The extension downloads the current year's workday data from `NateScarlet/holiday-cn` only when no local cache exists. On non-workdays it does not show a countdown or send reminders.
