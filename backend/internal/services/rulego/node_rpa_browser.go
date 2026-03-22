// RPA：通过 Chrome DevTools 远程调试端口控制已启动的 Chrome/Chromium（需以 --remote-debugging-port=9222 等方式启动）。
package rulego

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/runtime"
	cdptarget "github.com/chromedp/cdproto/target"
	"github.com/chromedp/chromedp"
	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/rulego/rulego/components/base"
	"github.com/rulego/rulego/utils/el"
	"github.com/rulego/rulego/utils/maps"
)

const defaultChromeDebuggerURL = "http://127.0.0.1:9222"

// metaRpaChromeTargetID 写入 metadata（便于排查）；主流程用 RuleContext 的 context.Value 传递 TargetID（msg 为值传递时 metadata 可能不可写）。
const metaRpaChromeTargetID = "_rpa_chrome_target_id"

type ctxKeyRpaChrome int

const (
	keyRpaChromeTargetID ctxKeyRpaChrome = 1
	// keyRpaChromeHold 在整条规则链执行期间复用远程 CDP 会话；勿在节点之间 cancel 带 Target 的 chromedp.Context，否则会 CloseTarget 关掉标签页。
	keyRpaChromeHold ctxKeyRpaChrome = 2
)

type rpaChromeHold struct {
	debuggerURL   string
	cancelAlloc   context.CancelFunc
	cancelBrowser context.CancelFunc
	cancelExec    context.CancelFunc
	execBase      context.Context
}

func (h *rpaChromeHold) close() {
	if h == nil {
		return
	}
	if h.cancelExec != nil {
		h.cancelExec()
		h.cancelExec = nil
	}
	if h.cancelBrowser != nil {
		h.cancelBrowser()
		h.cancelBrowser = nil
	}
	if h.cancelAlloc != nil {
		h.cancelAlloc()
		h.cancelAlloc = nil
	}
}

func rpaGetChromeHold(ctx types.RuleContext) *rpaChromeHold {
	c := ctx.GetContext()
	if c == nil {
		return nil
	}
	h, _ := c.Value(keyRpaChromeHold).(*rpaChromeHold)
	return h
}

func rpaSetChromeHold(ctx types.RuleContext, h *rpaChromeHold) {
	parent := ctx.GetContext()
	if parent == nil {
		parent = context.Background()
	}
	ctx.SetContext(context.WithValue(parent, keyRpaChromeHold, h))
}

func rpaGetStoredTargetID(ctx types.RuleContext, msg types.RuleMsg) string {
	if c := ctx.GetContext(); c != nil {
		if v := c.Value(keyRpaChromeTargetID); v != nil {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	if msg.Metadata != nil {
		return strings.TrimSpace(msg.Metadata.GetValue(metaRpaChromeTargetID))
	}
	return ""
}

func rpaPutStoredTargetID(ctx types.RuleContext, msg types.RuleMsg, id string) {
	id = strings.TrimSpace(id)
	if id == "" {
		return
	}
	parent := ctx.GetContext()
	if parent == nil {
		parent = context.Background()
	}
	ctx.SetContext(context.WithValue(parent, keyRpaChromeTargetID, id))
	if msg.Metadata != nil {
		msg.Metadata.PutValue(metaRpaChromeTargetID, id)
	}
}

func rpaExtractURLHint(data string) string {
	s := strings.TrimSpace(data)
	if s == "" || s == "{}" {
		return ""
	}
	var v struct {
		URL string `json:"url"`
	}
	if json.Unmarshal([]byte(s), &v) != nil || strings.TrimSpace(v.URL) == "" {
		return ""
	}
	return strings.TrimSpace(v.URL)
}

// isRpaChromeWebTab 判断是否为可附着的前台网页标签。新版 Chromium 常返回 type=tab，旧版为 page。
func isRpaChromeWebTab(info *cdptarget.Info) bool {
	if info == nil {
		return false
	}
	if strings.HasPrefix(info.URL, "devtools://") {
		return false
	}
	switch info.Type {
	case "page", "tab":
		return true
	default:
		return false
	}
}

func pickPageTarget(infos []*cdptarget.Info, stored string, urlHint string) (cdptarget.ID, error) {
	// 部分 Chrome / 版本下 Target.getTargets 与 /json/list 长期为空，但上一步附着过的 TargetID 仍有效
	if len(infos) == 0 {
		if sid := strings.TrimSpace(stored); sid != "" {
			return cdptarget.ID(sid), nil
		}
	}
	if sid := strings.TrimSpace(stored); sid != "" {
		id := cdptarget.ID(sid)
		for _, info := range infos {
			if info == nil {
				continue
			}
			if info.TargetID == id && isRpaChromeWebTab(info) {
				return id, nil
			}
		}
	}
	var pages []*cdptarget.Info
	for _, info := range infos {
		if !isRpaChromeWebTab(info) {
			continue
		}
		pages = append(pages, info)
	}
	if len(pages) == 0 {
		return "", errors.New("chrome 远程调试：未发现可用网页标签（需 type 为 page 或 tab），请至少打开一个普通标签页")
	}
	if urlHint != "" {
		for _, info := range pages {
			if strings.HasPrefix(info.URL, urlHint) || strings.Contains(info.URL, urlHint) {
				return info.TargetID, nil
			}
		}
	}
	for _, info := range pages {
		if info.URL == "about:blank" || info.URL == "" {
			return info.TargetID, nil
		}
	}
	for _, info := range pages {
		if info.URL != "" && info.URL != "about:blank" {
			return info.TargetID, nil
		}
	}
	return pages[0].TargetID, nil
}

// rpaChromeCreateBlankTarget 在浏览器进程中新建 about:blank 标签并返回 TargetID（用于 getTargets/json/list 为空时的兜底）。
func rpaChromeCreateBlankTarget(ctx context.Context) (cdptarget.ID, error) {
	c := chromedp.FromContext(ctx)
	if c == nil || c.Browser == nil {
		return "", errors.New("chrome 远程调试未建立 Browser 会话，无法新建标签")
	}
	tid, err := cdptarget.CreateTarget("about:blank").Do(cdp.WithExecutor(ctx, c.Browser))
	if err != nil {
		return "", fmt.Errorf("CreateTarget(about:blank): %w", err)
	}
	if tid == "" {
		return "", errors.New("CreateTarget 返回空 TargetID")
	}
	return tid, nil
}

// rpaChromeEnsureSession 建立或复用与 debuggerURL 对应的远程 CDP 会话及附着标签；同一 RuleContext 下多节点共用 execBase，避免节点结束时 cancel 导致 CloseTarget。
func rpaChromeEnsureSession(ctx types.RuleContext, msg types.RuleMsg, debuggerURL string) (*rpaChromeHold, error) {
	du := strings.TrimSpace(debuggerURL)
	if du == "" {
		du = defaultChromeDebuggerURL
	}

	if h := rpaGetChromeHold(ctx); h != nil {
		if h.debuggerURL == du && h.execBase != nil {
			return h, nil
		}
		h.close()
		rpaSetChromeHold(ctx, nil)
	}

	allocCtx, cancelAlloc := chromedp.NewRemoteAllocator(context.Background(), du)
	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
	// 禁止对 Targets/Run 使用随后会 cancel 的 WithTimeout 子 context：RemoteAllocator 会把该 ctx
	// 绑定到 teardown（allocate.go <-ctx.Done() 后 Cancel），defer cancel 会拆掉整段 CDP 连接。
	listDeadline := time.Now().Add(20 * time.Second)

	var infos []*cdptarget.Info
	var err error
	for attempt := 0; attempt < 15; attempt++ {
		if time.Now().After(listDeadline) {
			cancelBrowser()
			cancelAlloc()
			return nil, errors.New("列举 devtools 目标: 等待超时")
		}
		infos, err = chromedp.Targets(browserCtx)
		if err != nil {
			if attempt == 14 {
				cancelBrowser()
				cancelAlloc()
				return nil, fmt.Errorf("列举 devtools 目标: %w", err)
			}
			time.Sleep(80 * time.Millisecond)
			continue
		}
		if len(infos) > 0 {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	stored := rpaGetStoredTargetID(ctx, msg)
	urlHint := rpaExtractURLHint(msg.GetData())
	tid, err := pickPageTarget(infos, stored, urlHint)
	if err != nil {
		created, cerr := rpaChromeCreateBlankTarget(browserCtx)
		if cerr != nil {
			cancelBrowser()
			cancelAlloc()
			return nil, fmt.Errorf("%w；且无法自动新建标签: %w", err, cerr)
		}
		tid = created
	}

	execBase, cancelExec := chromedp.NewContext(allocCtx, chromedp.WithTargetID(tid))
	hold := &rpaChromeHold{
		debuggerURL:   du,
		cancelAlloc:   cancelAlloc,
		cancelBrowser: cancelBrowser,
		cancelExec:    cancelExec,
		execBase:      execBase,
	}
	rpaSetChromeHold(ctx, hold)
	return hold, nil
}

func rpaChromeRunTargetGone(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "No target with given id") || strings.Contains(s, "-32602")
}

// rpaChromeRun 连接远程 Chrome，复用 context/metadata 中的 TargetID；若无则按 urlHint（通常为上一步 Navigate 的 data.url）或 about:blank/已有页选择标签。
func rpaChromeRun(ctx types.RuleContext, msg types.RuleMsg, debuggerURL string, timeout time.Duration, actions chromedp.Tasks) error {
	hold, err := rpaChromeEnsureSession(ctx, msg, debuggerURL)
	if err != nil {
		return err
	}
	// 必须将未设置短生命周期 cancel 的 chromedp.Context 传给 Run；见 RemoteAllocator.Allocate 对 ctx.Done 的监听。
	run := func() error {
		return chromedp.Run(hold.execBase, actions)
	}
	if timeout <= 0 {
		err = run()
	} else {
		errCh := make(chan error, 1)
		go func() { errCh <- run() }()
		select {
		case err = <-errCh:
		case <-time.After(timeout):
			err = fmt.Errorf("chrome 操作超时（%s）", timeout)
		}
	}
	if err != nil {
		if rpaChromeRunTargetGone(err) {
			hold.close()
			rpaSetChromeHold(ctx, nil)
		}
		return err
	}
	if c := chromedp.FromContext(hold.execBase); c != nil && c.Target != nil && c.Target.TargetID != "" {
		rpaPutStoredTargetID(ctx, msg, string(c.Target.TargetID))
	}
	return nil
}

func init() {
	for _, n := range []types.Node{
		&RpaBrowserNavigateNode{},
		&RpaBrowserClickNode{},
		&RpaBrowserScreenshotNode{},
		&RpaBrowserQueryNode{},
	} {
		if err := rulego.Registry.Register(n); err != nil {
			log.Printf("[rulego] RPA 浏览器节点注册失败 type=%s: %v", n.Type(), err)
		} else {
			log.Printf("[rulego] 自定义节点已注册: type=%s", n.Type())
		}
	}
}

// --- Navigate ---

type RpaBrowserNavigateConfiguration struct {
	DebuggerURL string `json:"debuggerUrl"`
	URL         string `json:"url"`
	TimeoutMs   int    `json:"timeoutMs"`
}

type RpaBrowserNavigateNode struct {
	Config         RpaBrowserNavigateConfiguration
	debuggerTmpl   el.Template
	urlTmpl        el.Template
}

func (n *RpaBrowserNavigateNode) Type() string { return "x/rpaBrowserNavigate" }

func (n *RpaBrowserNavigateNode) New() types.Node {
	return &RpaBrowserNavigateNode{Config: RpaBrowserNavigateConfiguration{
		DebuggerURL: defaultChromeDebuggerURL,
		URL:         "https://example.com",
		TimeoutMs:   30000,
	}}
}

func (n *RpaBrowserNavigateNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := maps.Map2Struct(configuration, &n.Config); err != nil {
		return err
	}
	var err error
	n.debuggerTmpl, err = el.NewTemplate(n.Config.DebuggerURL)
	if err != nil {
		return err
	}
	n.urlTmpl, err = el.NewTemplate(n.Config.URL)
	return err
}

func (n *RpaBrowserNavigateNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	du := n.debuggerTmpl.ExecuteAsString(env)
	u := n.urlTmpl.ExecuteAsString(env)
	u = strings.TrimSpace(u)
	if u == "" {
		ctx.TellFailure(msg, errors.New("url is empty"))
		return
	}
	to := time.Duration(max(1, n.Config.TimeoutMs)) * time.Millisecond
	if err := rpaChromeRun(ctx, msg, du, to, chromedp.Tasks{
		chromedp.Navigate(u),
		chromedp.WaitReady("body"),
	}); err != nil {
		ctx.TellFailure(msg, err)
		return
	}
	out, _ := json.Marshal(map[string]any{"ok": true, "url": u})
	msg.SetData(string(out))
	ctx.TellSuccess(msg)
}

func (n *RpaBrowserNavigateNode) Destroy() {}

// --- Click ---

type RpaBrowserClickConfiguration struct {
	DebuggerURL string `json:"debuggerUrl"`
	Selector    string `json:"selector"`
	TimeoutMs   int    `json:"timeoutMs"`
	Button      string `json:"button"`
}

type RpaBrowserClickNode struct {
	Config       RpaBrowserClickConfiguration
	debuggerTmpl el.Template
	selTmpl      el.Template
}

func (n *RpaBrowserClickNode) Type() string { return "x/rpaBrowserClick" }

func (n *RpaBrowserClickNode) New() types.Node {
	return &RpaBrowserClickNode{Config: RpaBrowserClickConfiguration{
		DebuggerURL: defaultChromeDebuggerURL,
		Selector:    "button.submit",
		TimeoutMs:   30000,
		Button:      "left",
	}}
}

func (n *RpaBrowserClickNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := maps.Map2Struct(configuration, &n.Config); err != nil {
		return err
	}
	var err error
	n.debuggerTmpl, err = el.NewTemplate(n.Config.DebuggerURL)
	if err != nil {
		return err
	}
	n.selTmpl, err = el.NewTemplate(n.Config.Selector)
	return err
}

func (n *RpaBrowserClickNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	du := n.debuggerTmpl.ExecuteAsString(env)
	sel := strings.TrimSpace(n.selTmpl.ExecuteAsString(env))
	if sel == "" {
		ctx.TellFailure(msg, errors.New("selector is empty"))
		return
	}
	to := time.Duration(max(1, n.Config.TimeoutMs)) * time.Millisecond
	btn := strings.ToLower(strings.TrimSpace(n.Config.Button))
	var click chromedp.Action
	switch btn {
	case "right":
		click = chromedp.QueryAfter(sel, func(ctx context.Context, _ runtime.ExecutionContextID, nodes ...*cdp.Node) error {
			if len(nodes) < 1 {
				return fmt.Errorf("selector %q did not return any nodes", sel)
			}
			return chromedp.MouseClickNode(nodes[0], chromedp.ButtonRight).Do(ctx)
		}, chromedp.NodeVisible)
	default:
		click = chromedp.Click(sel, chromedp.NodeVisible)
	}
	err := rpaChromeRun(ctx, msg, du, to, chromedp.Tasks{
		chromedp.WaitVisible(sel),
		click,
	})
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}
	out, _ := json.Marshal(map[string]any{"ok": true, "selector": sel})
	msg.SetData(string(out))
	ctx.TellSuccess(msg)
}

func (n *RpaBrowserClickNode) Destroy() {}

// --- Screenshot ---

type RpaBrowserScreenshotConfiguration struct {
	DebuggerURL string `json:"debuggerUrl"`
	Selector    string `json:"selector"`
	TimeoutMs   int    `json:"timeoutMs"`
}

type RpaBrowserScreenshotNode struct {
	Config       RpaBrowserScreenshotConfiguration
	debuggerTmpl el.Template
	selTmpl      el.Template
}

func (n *RpaBrowserScreenshotNode) Type() string { return "x/rpaBrowserScreenshot" }

func (n *RpaBrowserScreenshotNode) New() types.Node {
	return &RpaBrowserScreenshotNode{Config: RpaBrowserScreenshotConfiguration{
		DebuggerURL: defaultChromeDebuggerURL,
		Selector:    "",
		TimeoutMs:   30000,
	}}
}

func (n *RpaBrowserScreenshotNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := maps.Map2Struct(configuration, &n.Config); err != nil {
		return err
	}
	var err error
	n.debuggerTmpl, err = el.NewTemplate(n.Config.DebuggerURL)
	if err != nil {
		return err
	}
	n.selTmpl, err = el.NewTemplate(n.Config.Selector)
	return err
}

func (n *RpaBrowserScreenshotNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	du := n.debuggerTmpl.ExecuteAsString(env)
	sel := strings.TrimSpace(n.selTmpl.ExecuteAsString(env))
	to := time.Duration(max(1, n.Config.TimeoutMs)) * time.Millisecond
	var buf []byte
	var tasks chromedp.Tasks
	if sel == "" {
		tasks = chromedp.Tasks{chromedp.CaptureScreenshot(&buf)}
	} else {
		tasks = chromedp.Tasks{
			chromedp.WaitVisible(sel),
			chromedp.Screenshot(sel, &buf, chromedp.NodeVisible),
		}
	}
	err := rpaChromeRun(ctx, msg, du, to, tasks)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}
	b64 := base64.StdEncoding.EncodeToString(buf)
	out, _ := json.Marshal(map[string]any{"ok": true, "image_base64": b64, "selector": sel})
	msg.SetData(string(out))
	ctx.TellSuccess(msg)
}

func (n *RpaBrowserScreenshotNode) Destroy() {}

// --- Query (selector → text/html/value/attr) ---

type RpaBrowserQueryConfiguration struct {
	DebuggerURL    string `json:"debuggerUrl"`
	Selector       string `json:"selector"`
	QueryMode      string `json:"queryMode"`
	AttributeName  string `json:"attributeName"`
	TimeoutMs      int    `json:"timeoutMs"`
}

type RpaBrowserQueryNode struct {
	Config          RpaBrowserQueryConfiguration
	debuggerTmpl    el.Template
	selTmpl         el.Template
	attrTmpl        el.Template
}

func (n *RpaBrowserQueryNode) Type() string { return "x/rpaBrowserQuery" }

func (n *RpaBrowserQueryNode) New() types.Node {
	return &RpaBrowserQueryNode{Config: RpaBrowserQueryConfiguration{
		DebuggerURL:   defaultChromeDebuggerURL,
		Selector:      "h1",
		QueryMode:     "text",
		AttributeName: "href",
		TimeoutMs:     30000,
	}}
}

func (n *RpaBrowserQueryNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := maps.Map2Struct(configuration, &n.Config); err != nil {
		return err
	}
	var err error
	n.debuggerTmpl, err = el.NewTemplate(n.Config.DebuggerURL)
	if err != nil {
		return err
	}
	n.selTmpl, err = el.NewTemplate(n.Config.Selector)
	if err != nil {
		return err
	}
	n.attrTmpl, err = el.NewTemplate(n.Config.AttributeName)
	return err
}

func (n *RpaBrowserQueryNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	du := n.debuggerTmpl.ExecuteAsString(env)
	sel := strings.TrimSpace(n.selTmpl.ExecuteAsString(env))
	if sel == "" {
		ctx.TellFailure(msg, errors.New("selector is empty"))
		return
	}
	mode := strings.ToLower(strings.TrimSpace(n.Config.QueryMode))
	if mode == "" {
		mode = "text"
	}
	to := time.Duration(max(1, n.Config.TimeoutMs)) * time.Millisecond

	var result string
	var tasks chromedp.Tasks
	switch mode {
	case "text":
		tasks = chromedp.Tasks{
			chromedp.WaitVisible(sel),
			chromedp.Text(sel, &result, chromedp.NodeVisible),
		}
	case "html":
		tasks = chromedp.Tasks{
			chromedp.WaitVisible(sel),
			chromedp.OuterHTML(sel, &result, chromedp.NodeVisible),
		}
	case "value":
		tasks = chromedp.Tasks{
			chromedp.WaitVisible(sel),
			chromedp.Value(sel, &result, chromedp.NodeVisible),
		}
	case "attr":
		attrName := strings.TrimSpace(n.attrTmpl.ExecuteAsString(env))
		if attrName == "" {
			ctx.TellFailure(msg, errors.New("attributeName is empty for queryMode=attr"))
			return
		}
		var ok bool
		var val string
		tasks = chromedp.Tasks{
			chromedp.WaitVisible(sel),
			chromedp.AttributeValue(sel, attrName, &val, &ok, chromedp.NodeVisible),
		}
		if err := rpaChromeRun(ctx, msg, du, to, tasks); err != nil {
			ctx.TellFailure(msg, err)
			return
		}
		if !ok {
			ctx.TellFailure(msg, fmt.Errorf("attribute %q not found on %s", attrName, sel))
			return
		}
		out, _ := json.Marshal(map[string]any{"ok": true, "query_mode": mode, "selector": sel, "attribute": attrName, "result": val})
		msg.SetData(string(out))
		ctx.TellSuccess(msg)
		return
	default:
		ctx.TellFailure(msg, fmt.Errorf("unknown queryMode %q (use text|html|value|attr)", mode))
		return
	}

	if err := rpaChromeRun(ctx, msg, du, to, tasks); err != nil {
		ctx.TellFailure(msg, err)
		return
	}
	out, _ := json.Marshal(map[string]any{"ok": true, "query_mode": mode, "selector": sel, "result": result})
	msg.SetData(string(out))
	ctx.TellSuccess(msg)
}

func (n *RpaBrowserQueryNode) Destroy() {}
