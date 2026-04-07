//go:build !darwin

package main

import "fmt"

func sendACPSystemNotification(_ string, _ string) error {
	return fmt.Errorf("当前平台不支持 ACP 系统通知")
}
