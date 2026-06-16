# 下班提醒

用于中国工作日下班提醒的 Raycast 扩展。

## 使用方式

1. 在扩展设置中配置 `Work Start Time`、`Lunch Start Time`、`Lunch End Time` 和 `Offwork Time`，格式为 `HH:mm`。
2. 打开 `Offwork Reminder` 查看当天倒计时。
3. 手动运行一次 `距下班还剩`，或在 Raycast 设置中开启它的后台刷新，这样 Raycast 根搜索里可以直接显示最新倒计时，下班提醒也能自动执行。

扩展会在本地没有当年缓存时，从 `NateScarlet/holiday-cn` 获取当年工作日数据并缓存到 Raycast LocalStorage。非工作日或非工作时间不会显示工作倒计时，也不会提前发送提醒。
