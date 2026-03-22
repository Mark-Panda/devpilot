//go:build darwin

package rulego

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/rulego/rulego/components/base"
	"github.com/rulego/rulego/utils/el"
	"github.com/rulego/rulego/utils/maps"
)

func init() {
	for _, n := range []types.Node{
		&RpaScreenCaptureNode{},
		&RpaMacWindowNode{},
		&RpaDesktopClickNode{},
	} {
		if err := rulego.Registry.Register(n); err != nil {
			log.Printf("[rulego] RPA 桌面节点注册失败 type=%s: %v", n.Type(), err)
		} else {
			log.Printf("[rulego] 自定义节点已注册: type=%s", n.Type())
		}
	}
}

// --- Screen capture (screencapture) ---

type RpaScreenCaptureConfiguration struct {
	Mode       string `json:"mode"`
	Top        int    `json:"top"`
	Left       int    `json:"left"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	OutputPath string `json:"outputPath"`
}

type RpaScreenCaptureNode struct {
	Config        RpaScreenCaptureConfiguration
	outputPathTmpl el.Template
}

func (n *RpaScreenCaptureNode) Type() string { return "x/rpaScreenCapture" }

func (n *RpaScreenCaptureNode) New() types.Node {
	return &RpaScreenCaptureNode{Config: RpaScreenCaptureConfiguration{Mode: "full"}}
}

func (n *RpaScreenCaptureNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := maps.Map2Struct(configuration, &n.Config); err != nil {
		return err
	}
	var err error
	n.outputPathTmpl, err = el.NewTemplate(n.Config.OutputPath)
	return err
}

func (n *RpaScreenCaptureNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	mode := strings.ToLower(strings.TrimSpace(n.Config.Mode))
	if mode == "" {
		mode = "full"
	}
	userPath := strings.TrimSpace(n.outputPathTmpl.ExecuteAsString(env))
	outPath := userPath

	var tmp string
	if outPath == "" {
		f, err := os.CreateTemp("", "rpa-cap-*.png")
		if err != nil {
			ctx.TellFailure(msg, err)
			return
		}
		tmp = f.Name()
		_ = f.Close()
		defer func() { _ = os.Remove(tmp) }()
		outPath = tmp
	} else {
		outPath = getAbsPath(ctx, outPath)
		outPath, _ = filepath.Abs(outPath)
		if err := checkPath(ctx, outPath); err != nil {
			ctx.TellFailure(msg, err)
			return
		}
		_ = os.MkdirAll(filepath.Dir(outPath), 0755)
	}

	args := []string{"-x", "-t", "png"}
	if mode == "region" {
		if n.Config.Width <= 0 || n.Config.Height <= 0 {
			ctx.TellFailure(msg, errors.New("region 模式需要 width/height > 0"))
			return
		}
		rect := fmt.Sprintf("%d,%d,%d,%d", n.Config.Top, n.Config.Left, n.Config.Width, n.Config.Height)
		args = append(args, "-R", rect)
	}
	args = append(args, outPath)

	cmd := exec.Command("/usr/sbin/screencapture", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		ctx.TellFailure(msg, fmt.Errorf("screencapture: %w: %s", err, strings.TrimSpace(string(out))))
		return
	}
	data, err := os.ReadFile(outPath)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}
	b64 := base64.StdEncoding.EncodeToString(data)
	resp := map[string]any{"ok": true, "image_base64": b64}
	if userPath != "" {
		resp["path"] = outPath
	}
	raw, _ := json.Marshal(resp)
	msg.SetData(string(raw))
	ctx.TellSuccess(msg)
}

func (n *RpaScreenCaptureNode) Destroy() {}

// --- macOS window (AppleScript) ---

type RpaMacWindowConfiguration struct {
	Action      string `json:"action"`
	AppName     string `json:"appName"`
	WindowTitle string `json:"windowTitle"`
}

type RpaMacWindowNode struct {
	Config           RpaMacWindowConfiguration
	appTmpl          el.Template
	windowTitleTmpl  el.Template
}

func (n *RpaMacWindowNode) Type() string { return "x/rpaMacWindow" }

func (n *RpaMacWindowNode) New() types.Node {
	return &RpaMacWindowNode{Config: RpaMacWindowConfiguration{Action: "frontmost"}}
}

func (n *RpaMacWindowNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := maps.Map2Struct(configuration, &n.Config); err != nil {
		return err
	}
	var err error
	n.appTmpl, err = el.NewTemplate(n.Config.AppName)
	if err != nil {
		return err
	}
	n.windowTitleTmpl, err = el.NewTemplate(n.Config.WindowTitle)
	return err
}

func (n *RpaMacWindowNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	action := strings.ToLower(strings.TrimSpace(n.Config.Action))
	if action == "" {
		action = "frontmost"
	}
	app := strings.TrimSpace(n.appTmpl.ExecuteAsString(env))
	title := strings.TrimSpace(n.windowTitleTmpl.ExecuteAsString(env))

	var script string
	switch action {
	case "frontmost":
		script = `
tell application "System Events"
  set frontApp to name of first application process whose frontmost is true
  set winTitle to ""
  try
    set winTitle to name of window 1 of process frontApp
  end try
  return frontApp & tab & winTitle
end tell
`
	case "activate":
		if app == "" {
			ctx.TellFailure(msg, errors.New("action=activate 需要 appName"))
			return
		}
		appEsc := strings.ReplaceAll(app, "\\", "\\\\")
		appEsc = strings.ReplaceAll(appEsc, "\"", "\\\"")
		if title != "" {
			titleEsc := strings.ReplaceAll(title, "\\", "\\\\")
			titleEsc = strings.ReplaceAll(titleEsc, "\"", "\\\"")
			script = fmt.Sprintf(
				`tell application "%s" to activate
delay 0.2
tell application "System Events" to tell process "%s"
  set frontmost to true
  try
    if exists (first window whose name is "%s") then
      perform action "AXRaise" of (first window whose name is "%s")
    end if
  end try
end tell`,
				appEsc, appEsc, titleEsc, titleEsc)
		} else {
			script = fmt.Sprintf(`tell application "%s" to activate`, appEsc)
		}
	case "list":
		script = `
set out to ""
tell application "System Events"
  repeat with p in application processes
    set pn to name of p
    try
      repeat with w in windows of p
        set out to out & pn & " | " & (name of w as string) & linefeed
      end repeat
    end try
  end repeat
end tell
return out
`
	default:
		ctx.TellFailure(msg, fmt.Errorf("未知 action %q，支持 frontmost|activate|list", action))
		return
	}

	cmd := exec.Command("/usr/bin/osascript", "-e", script)
	out, err := cmd.CombinedOutput()
	if err != nil {
		ctx.TellFailure(msg, fmt.Errorf("AppleScript: %w: %s", err, strings.TrimSpace(string(out))))
		return
	}
	text := strings.TrimSpace(string(out))
	resp := map[string]any{"ok": true, "action": action, "result": text}
	if action == "frontmost" {
		parts := strings.SplitN(text, "\t", 2)
		resp["app_name"] = parts[0]
		if len(parts) > 1 {
			resp["window_title"] = parts[1]
		}
	}
	raw, _ := json.Marshal(resp)
	msg.SetData(string(raw))
	ctx.TellSuccess(msg)
}

func (n *RpaMacWindowNode) Destroy() {}

// --- Desktop click (screen coordinates, Accessibility) ---

type RpaDesktopClickConfiguration struct {
	X string `json:"x"`
	Y string `json:"y"`
}

type RpaDesktopClickNode struct {
	Config RpaDesktopClickConfiguration
	xTmpl  el.Template
	yTmpl  el.Template
}

func (n *RpaDesktopClickNode) Type() string { return "x/rpaDesktopClick" }

func (n *RpaDesktopClickNode) New() types.Node {
	return &RpaDesktopClickNode{Config: RpaDesktopClickConfiguration{X: "100", Y: "100"}}
}

func (n *RpaDesktopClickNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := maps.Map2Struct(configuration, &n.Config); err != nil {
		return err
	}
	var err error
	n.xTmpl, err = el.NewTemplate(n.Config.X)
	if err != nil {
		return err
	}
	n.yTmpl, err = el.NewTemplate(n.Config.Y)
	return err
}

func (n *RpaDesktopClickNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	xs := strings.TrimSpace(n.xTmpl.ExecuteAsString(env))
	ys := strings.TrimSpace(n.yTmpl.ExecuteAsString(env))
	x, err := strconv.Atoi(xs)
	if err != nil {
		ctx.TellFailure(msg, fmt.Errorf("x 非整数: %q", xs))
		return
	}
	y, err := strconv.Atoi(ys)
	if err != nil {
		ctx.TellFailure(msg, fmt.Errorf("y 非整数: %q", ys))
		return
	}
	script := fmt.Sprintf(`tell application "System Events" to click at {%d, %d}`, x, y)
	cmd := exec.Command("/usr/bin/osascript", "-e", script)
	out, err := cmd.CombinedOutput()
	if err != nil {
		ctx.TellFailure(msg, fmt.Errorf("桌面点击失败（需为 DevPilot 开启辅助功能权限）: %w: %s", err, strings.TrimSpace(string(out))))
		return
	}
	raw, _ := json.Marshal(map[string]any{"ok": true, "x": x, "y": y})
	msg.SetData(string(raw))
	ctx.TellSuccess(msg)
}

func (n *RpaDesktopClickNode) Destroy() {}
