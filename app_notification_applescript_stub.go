//go:build !darwin

package main

import "errors"

func sendACPNotificationAppleScriptFallback(string, string) error {
	return errors.New("applescript notification only on darwin")
}
