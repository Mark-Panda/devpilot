//go:build darwin

package main

import "github.com/wailsapp/wails/v2/pkg/mac"

// sendACPNotificationAppleScriptFallback 在 UNUserNotificationCenter 失败时回退到 osascript，
// 部分 macOS 版本或权限状态下原生 API 会失败，脚本通知仍可能送达。
func sendACPNotificationAppleScriptFallback(title string, body string) error {
	return mac.ShowNotification(title, "", body, "")
}
