//go:build darwin && cgo

package main

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Foundation -framework UserNotifications

#include <stdlib.h>
#include <string.h>

#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>

// devpilot_send_user_notification 使用 UNUserNotificationCenter，会触发系统对本应用的「通知」权限询问（首次），
// 并以 DevPilot 身份展示通知；避免 Wails mac.ShowNotification 走 osascript 导致无权限弹窗、通知不归属本应用。
// 部署目标与主程序一致（见 Info.plist LSMinimumSystemVersion）；此处用 pragma 避免与默认 10.13 链接目标冲突时的 -Wunguarded-availability-new / 部分 CI 的 -Werror。
static void devpilot_send_user_notification(const char *titleC, const char *bodyC, char **errOut) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunguarded-availability-new"
	__block NSString *blockErr = nil;
	dispatch_semaphore_t done = dispatch_semaphore_create(0);

	dispatch_async(dispatch_get_main_queue(), ^{
		NSString *title = [NSString stringWithUTF8String:titleC];
		NSString *body = [NSString stringWithUTF8String:bodyC];
		if (title == nil) title = @"DevPilot";
		if (body == nil) body = @"";

		UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
		[center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge)
		                          completionHandler:^(BOOL granted, NSError *_Nullable error) {
			if (!granted) {
				if (error != nil) {
					blockErr = [error localizedDescription];
				} else {
					blockErr = @"未授予通知权限（请在「系统设置 › 通知」应用列表中找到 DevPilot 并开启）";
				}
				dispatch_semaphore_signal(done);
				return;
			}
			UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
			content.title = title;
			content.body = body;
			NSString *nid = [[NSUUID UUID] UUIDString];
			UNNotificationRequest *req = [UNNotificationRequest requestWithIdentifier:nid content:content trigger:nil];
			[center addNotificationRequest:req
			         withCompletionHandler:^(NSError *_Nullable e) {
				         if (e != nil) {
					         blockErr = [e localizedDescription];
				         }
				         dispatch_semaphore_signal(done);
			         }];
		}];
	});

	if ([NSThread isMainThread]) {
		while (dispatch_semaphore_wait(done, DISPATCH_TIME_NOW) != 0) {
			[[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
			                         beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
		}
	} else {
		dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);
	}
	// 启用 -fobjc-arc 时由 ARC 管理 GCD 对象，勿再 dispatch_release(done)。

	if (blockErr != nil && errOut != nil) {
		const char *utf8 = [blockErr UTF8String];
		if (utf8 != NULL) {
			*errOut = strdup(utf8);
		}
	}
#pragma clang diagnostic pop
}

static void devpilot_free_cstring(char *p) { free(p); }
*/
import "C"

import (
	"errors"
	"strings"
	"unsafe"
)

func sendACPSystemNotification(title string, body string) error {
	if strings.TrimSpace(title) == "" {
		title = "DevPilot"
	}
	ctitle := C.CString(title)
	defer C.free(unsafe.Pointer(ctitle))
	cbody := C.CString(body)
	defer C.free(unsafe.Pointer(cbody))

	var cerr *C.char
	C.devpilot_send_user_notification(ctitle, cbody, &cerr)
	if cerr != nil {
		defer C.devpilot_free_cstring(cerr)
		return errors.New(C.GoString(cerr))
	}
	return nil
}
