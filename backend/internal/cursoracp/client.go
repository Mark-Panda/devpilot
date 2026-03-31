// Package cursoracp 通过 stdio JSON-RPC 调用 Cursor CLI 的 ACP 模式（agent acp）。
// 与「agent --print」单次调用互补，适合需要会话、流式输出与工具权限自动批复的场景。
// 协议说明：https://cursor.com/cn/docs/cli/acp
package cursoracp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
)

// Config 启动子进程与客户端声明信息。
type Config struct {
	// SessionMode 可选：创建 ACP 会话时传入 session/new 的 mode（agent / plan / ask）。
	SessionMode string
	// AgentCommand 默认可执行文件名为 agent（需在 PATH 或填绝对路径）。
	AgentCommand string
	// Args 传给子进程的参数，须包含 acp；为空时等价于 []string{"acp"}。
	Args []string
	// Env 为子进程环境；nil 表示使用 os.Environ()。
	Env []string
	// ClientName / ClientVersion 用于 initialize.clientInfo。
	ClientName    string
	ClientVersion string
	// PermissionOptionID 收到 session/request_permission 时自动回复的选项：
	// allow-once、allow-always、reject-once（与 Cursor 文档一致）。
	PermissionOptionID string
	// AutoReply 对 session/elicitation、cursor/create_plan、cursor/ask_question 等客户端请求的自动批复。
	AutoReply AutoReplyConfig
	// VerboseLog 为 true 时打印工作区绝对路径（由调用方在 session/new 前记录）以及每条 agent_message_chunk 流式文本。
	VerboseLog bool
}

func (c *Config) agentCommand() string {
	s := strings.TrimSpace(c.AgentCommand)
	if s == "" {
		return "agent"
	}
	return s
}

func (c *Config) args() []string {
	if len(c.Args) > 0 {
		return append([]string(nil), c.Args...)
	}
	return []string{"acp"}
}

func (c *Config) clientName() string {
	if strings.TrimSpace(c.ClientName) != "" {
		return c.ClientName
	}
	return "devpilot-cursoracp"
}

func (c *Config) clientVersion() string {
	if strings.TrimSpace(c.ClientVersion) != "" {
		return c.ClientVersion
	}
	return "0.1.0"
}

func (c *Config) permissionOption() string {
	switch strings.TrimSpace(c.PermissionOptionID) {
	case "allow-always", "reject-once":
		return strings.TrimSpace(c.PermissionOptionID)
	default:
		return "allow-once"
	}
}

type jsonRPCError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

type outcome struct {
	result json.RawMessage
	rpcErr *jsonRPCError
}

// Client 表示一条与 agent acp 子进程的会话。
type Client struct {
	cfg Config

	cmd    *exec.Cmd
	stdin  io.WriteCloser
	cancel context.CancelFunc

	mu      sync.Mutex
	pending map[int64]chan outcome
	nextID  int64

	writeMu sync.Mutex

	streamMu sync.Mutex
	stream   strings.Builder

	onChunk func(text string)
	chunkMu sync.RWMutex

	readOnce sync.Once
	readErr  error
	wg       sync.WaitGroup
}

// NewClient 构造客户端（尚未启动子进程）。
func NewClient(cfg Config) *Client {
	return &Client{
		cfg:     cfg,
		pending: make(map[int64]chan outcome),
	}
}

// SetOnChunk 设置收到 session/update 中文本块时的回调（可选）。
func (c *Client) SetOnChunk(fn func(text string)) {
	c.chunkMu.Lock()
	c.onChunk = fn
	c.chunkMu.Unlock()
}

// Start 启动 agent acp 子进程并开始读取 stdout。
func (c *Client) Start(ctx context.Context) error {
	if c.cmd != nil {
		return errors.New("cursoracp: already started")
	}
	runCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel

	args := c.cfg.args()
	c.cmd = exec.CommandContext(runCtx, c.cfg.agentCommand(), args...)
	if c.cfg.Env != nil {
		c.cmd.Env = c.cfg.Env
	} else {
		c.cmd.Env = os.Environ()
	}

	stdin, err := c.cmd.StdinPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("cursoracp stdin: %w", err)
	}
	stdout, err := c.cmd.StdoutPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("cursoracp stdout: %w", err)
	}
	c.cmd.Stderr = os.Stderr

	if err := c.cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("cursoracp start: %w", err)
	}
	c.stdin = stdin

	c.wg.Add(1)
	go c.readLoop(stdout)
	return nil
}

// Close 结束子进程并等待读协程退出。
func (c *Client) Close() error {
	if c.cancel != nil {
		c.cancel()
	}
	if c.stdin != nil {
		_ = c.stdin.Close()
	}
	var err error
	if c.cmd != nil && c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
		err = c.cmd.Wait()
	}
	c.wg.Wait()
	return err
}

func (c *Client) readLoop(r io.Reader) {
	defer c.wg.Done()
	sc := bufio.NewScanner(r)
	const max = 1024 * 1024
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, max)
	for sc.Scan() {
		line := sc.Bytes()
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}
		c.handleIncomingLine(line)
	}
	if err := sc.Err(); err != nil {
		c.readOnce.Do(func() { c.readErr = err })
	}
	c.failAllPending(errors.New("cursoracp: stdout closed"))
}

func (c *Client) failAllPending(err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for id, ch := range c.pending {
		select {
		case ch <- outcome{rpcErr: &jsonRPCError{Code: -1, Message: err.Error()}}:
		default:
		}
		delete(c.pending, id)
	}
}

func parseID(raw json.RawMessage) (int64, bool) {
	if len(raw) == 0 {
		return 0, false
	}
	var n json.Number
	if err := json.Unmarshal(raw, &n); err != nil {
		return 0, false
	}
	v, err := n.Int64()
	if err != nil {
		return 0, false
	}
	return v, true
}

func (c *Client) handleIncomingLine(line []byte) {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(line, &m); err != nil {
		return
	}
	_, hasResult := m["result"]
	_, hasError := m["error"]
	methodRaw, hasMethod := m["method"]
	idRaw, hasID := m["id"]

	if hasResult || hasError {
		if !hasID {
			return
		}
		id, ok := parseID(idRaw)
		if !ok {
			return
		}
		var rpcErr *jsonRPCError
		if len(m["error"]) > 0 {
			rpcErr = &jsonRPCError{}
			_ = json.Unmarshal(m["error"], rpcErr)
		}
		oc := outcome{result: m["result"], rpcErr: rpcErr}
		c.mu.Lock()
		ch := c.pending[id]
		delete(c.pending, id)
		c.mu.Unlock()
		if ch != nil {
			select {
			case ch <- oc:
			default:
			}
		}
		return
	}

	if hasMethod {
		var method string
		_ = json.Unmarshal(methodRaw, &method)
		if hasID {
			id, ok := parseID(idRaw)
			if !ok {
				return
			}
			switch method {
			case "session/request_permission":
				c.replyPermission(id)
			case "session/elicitation":
				c.replyRPCResult(id, autoReplyElicitation(m["params"], c.cfg.AutoReply))
			default:
				if strings.HasPrefix(method, "cursor/") {
					if res := autoReplyCursorExtension(method, m["params"], c.cfg.AutoReply); res != nil {
						c.replyRPCResult(id, res)
					}
				}
			}
			return
		}
		if method == "session/update" {
			c.handleSessionUpdate(m["params"])
		}
	}
}

func (c *Client) replyRPCResult(id int64, result interface{}) {
	_ = c.writeJSON(map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      id,
		"result":  result,
	})
}

func (c *Client) replyPermission(id int64) {
	opt := c.cfg.permissionOption()
	c.replyRPCResult(id, map[string]interface{}{
		"outcome": map[string]interface{}{
			"outcome":  "selected",
			"optionId": opt,
		},
	})
}

func (c *Client) handleSessionUpdate(params json.RawMessage) {
	if len(params) == 0 {
		return
	}
	var wrap struct {
		Update struct {
			SessionUpdate string `json:"sessionUpdate"`
			Content       struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"update"`
	}
	if err := json.Unmarshal(params, &wrap); err != nil {
		return
	}
	if wrap.Update.SessionUpdate != "agent_message_chunk" || wrap.Update.Content.Text == "" {
		return
	}
	text := wrap.Update.Content.Text
	c.streamMu.Lock()
	c.stream.WriteString(text)
	c.streamMu.Unlock()
	c.chunkMu.RLock()
	fn := c.onChunk
	c.chunkMu.RUnlock()
	if fn != nil {
		fn(text)
	}
	if c.cfg.VerboseLog && strings.TrimSpace(text) != "" {
		log.Printf("[cursoracp] stream chunk: %s", text)
	}
}

func (c *Client) writeJSON(v interface{}) error {
	line, err := json.Marshal(v)
	if err != nil {
		return err
	}
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	if c.stdin == nil {
		return errors.New("cursoracp: stdin closed")
	}
	_, err = fmt.Fprintf(c.stdin, "%s\n", line)
	return err
}

func (c *Client) call(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
	id := atomic.AddInt64(&c.nextID, 1)
	ch := make(chan outcome, 1)
	c.mu.Lock()
	c.pending[id] = ch
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
	}()

	msg := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      id,
		"method":  method,
		"params":  params,
	}
	if err := c.writeJSON(msg); err != nil {
		return nil, err
	}

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case oc := <-ch:
		if oc.rpcErr != nil {
			return nil, fmt.Errorf("cursoracp rpc error %d: %s", oc.rpcErr.Code, oc.rpcErr.Message)
		}
		return oc.result, nil
	}
}

// Initialize 发送 initialize。
func (c *Client) Initialize(ctx context.Context) error {
	params := map[string]interface{}{
		"protocolVersion": 1,
		"clientCapabilities": map[string]interface{}{
			"fs": map[string]bool{
				"readTextFile":  false,
				"writeTextFile": false,
			},
			"terminal": false,
			"elicitation": map[string]interface{}{
				"form": map[string]interface{}{},
			},
		},
		"clientInfo": map[string]string{
			"name":    c.cfg.clientName(),
			"version": c.cfg.clientVersion(),
		},
	}
	_, err := c.call(ctx, "initialize", params)
	return err
}

// Authenticate 使用 cursor_login。
func (c *Client) Authenticate(ctx context.Context) error {
	_, err := c.call(ctx, "authenticate", map[string]string{"methodId": "cursor_login"})
	return err
}

// NewSessionParams 创建会话参数。
type NewSessionParams struct {
	Cwd        string
	MCPServers []interface{}
	// Mode 可选：agent、plan、ask（与 Cursor ACP 文档一致）；空表示由服务端默认。
	Mode string
}

// NewSession 调用 session/new。
func (c *Client) NewSession(ctx context.Context, p NewSessionParams) (string, error) {
	mcp := p.MCPServers
	if mcp == nil {
		mcp = []interface{}{}
	}
	params := map[string]interface{}{
		"cwd":        p.Cwd,
		"mcpServers": mcp,
	}
	if m := strings.TrimSpace(p.Mode); m != "" {
		params["mode"] = m
	}
	result, err := c.call(ctx, "session/new", params)
	if err != nil {
		return "", err
	}
	var out struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(result, &out); err != nil {
		return "", fmt.Errorf("cursoracp session/new parse: %w", err)
	}
	if strings.TrimSpace(out.SessionID) == "" {
		return "", errors.New("cursoracp: empty sessionId")
	}
	return out.SessionID, nil
}

// PromptResult 为 session/prompt 的 result 解析结果。
type PromptResult struct {
	StopReason string `json:"stopReason"`
	Raw        json.RawMessage
}

// Prompt 调用 session/prompt；流式文本会写入内部缓冲并触发 SetOnChunk。
func (c *Client) Prompt(ctx context.Context, sessionID, text string) (*PromptResult, error) {
	c.streamMu.Lock()
	c.stream.Reset()
	c.streamMu.Unlock()

	params := map[string]interface{}{
		"sessionId": sessionID,
		"prompt": []map[string]string{
			{"type": "text", "text": text},
		},
	}
	raw, err := c.call(ctx, "session/prompt", params)
	if err != nil {
		return nil, err
	}
	var pr PromptResult
	pr.Raw = raw
	_ = json.Unmarshal(raw, &pr)
	return &pr, nil
}

// StreamText 返回当前已收集的流式拼接文本（Prompt 返回后可与最终结果对照）。
func (c *Client) StreamText() string {
	c.streamMu.Lock()
	defer c.streamMu.Unlock()
	return c.stream.String()
}

// RunOnce 启动客户端、完成握手、创建会话并执行一次 Prompt，最后关闭子进程。
func RunOnce(ctx context.Context, cfg Config, cwd, prompt string) (*PromptResult, string, error) {
	cl := NewClient(cfg)
	if err := cl.Start(ctx); err != nil {
		return nil, "", err
	}
	defer func() { _ = cl.Close() }()

	if err := cl.Initialize(ctx); err != nil {
		return nil, "", fmt.Errorf("initialize: %w", err)
	}
	if err := cl.Authenticate(ctx); err != nil {
		return nil, "", fmt.Errorf("authenticate: %w", err)
	}
	if cfg.VerboseLog {
		logWorkspaceCwd("cursor/acp", cwd)
	}
	sid, err := cl.NewSession(ctx, NewSessionParams{
		Cwd:  cwd,
		Mode: strings.TrimSpace(cfg.SessionMode),
	})
	if err != nil {
		return nil, "", fmt.Errorf("session/new: %w", err)
	}
	pr, err := cl.Prompt(ctx, sid, prompt)
	if err != nil {
		return nil, "", fmt.Errorf("session/prompt: %w", err)
	}
	stream := cl.StreamText()
	if cfg.VerboseLog && pr != nil {
		log.Printf("[cursoracp] cursor/acp prompt done stopReason=%q streamChars=%d", pr.StopReason, len(stream))
	}
	return pr, stream, nil
}

func logWorkspaceCwd(scope, cwd string) {
	abs := strings.TrimSpace(cwd)
	if abs == "" {
		return
	}
	if a, err := filepath.Abs(abs); err == nil {
		abs = a
	}
	log.Printf("[cursoracp] %s workspace cwd=%s", scope, abs)
}
