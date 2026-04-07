//go:build darwin

package main

import (
	"strings"

	"github.com/wailsapp/wails/v2/pkg/mac"
)

func sendACPSystemNotification(title string, body string) error {
	if strings.TrimSpace(title) == "" {
		title = "DevPilot"
	}
	return mac.ShowNotification(title, "", body, "")
}
