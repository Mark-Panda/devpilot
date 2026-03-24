package llm

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log"
	"os/exec"
	"strings"
)

// lineLogWriter 实现 io.Writer：按行缓冲，每行完整后打印到日志，便于长时间运行的技能实时看到进度。
type lineLogWriter struct {
	prefix string
	line   []byte
}

func (w *lineLogWriter) Write(p []byte) (n int, err error) {
	w.line = append(w.line, p...)
	for {
		i := bytes.IndexByte(w.line, '\n')
		if i < 0 {
			return len(p), nil
		}
		line := string(bytes.TrimSpace(w.line[:i]))
		w.line = w.line[i+1:]
		if line != "" {
			log.Printf("%s %s", w.prefix, line)
		}
	}
}

func (w *lineLogWriter) Flush() {
	if len(w.line) > 0 {
		line := string(bytes.TrimSpace(w.line))
		if line != "" {
			log.Printf("%s %s", w.prefix, line)
		}
		w.line = nil
	}
}

// RuleChainExecutor 当技能带 rule_chain_id 时，用此回调执行规则链并返回结果。由业务层（如 rulego.Service）注入。
var RuleChainExecutor func(ctx context.Context, ruleChainID string, userInput string) (string, error)

// skillExecutor 实现 ToolExecutor：当模型返回 tool_call 且 name 为某技能名时，
// 优先执行技能的 command（若有），否则若含 rule_chain_id 则执行规则链，否则用 Content 做一次子轮 LLM 调用。
type skillExecutor struct {
	client *Client
	skills []Skill
}

// NewSkillExecutor 返回一个 ToolExecutor，用于在 GenerateWithToolLoop 中执行“技能调用”。
// 执行时：按 name 查找技能；若有 Command 则直接执行命令（arguments 传 stdin）；若有 RuleChainID 则调用 RuleChainExecutor；否则 ChatWithSystem。
func NewSkillExecutor(client *Client, skills []Skill) ToolExecutor {
	if client == nil || len(skills) == 0 {
		return nil
	}
	return &skillExecutor{client: client, skills: skills}
}

// Execute 实现 ToolExecutor。根据 name 查找技能；若有 command 则执行命令并返回输出；若为规则链则执行规则链；否则做一次子轮 LLM 对话。
func (e *skillExecutor) Execute(ctx context.Context, name, arguments string) (string, error) {
	var skill *Skill
	for i := range e.skills {
		if e.skills[i].Name == name {
			skill = &e.skills[i]
			break
		}
	}
	if skill == nil {
		return "", ErrSkillNotFound
	}
	userInput := arguments
	if userInput == "" {
		userInput = "(no input)"
	}
	// 1) 若技能配置了 command，直接执行命令（以技能目录为 cwd，arguments 传 stdin），真正跑脚本并等待结果
	if cmdStr := strings.TrimSpace(skill.Command); cmdStr != "" {
		out, err := runSkillCommand(ctx, skill.Dir, cmdStr, userInput)
		if err != nil && skill.CommandLLMFallbackExit > 0 && exitCodeOf(err) == skill.CommandLLMFallbackExit {
			return e.client.ChatWithSystem(ctx, skill.Content, userInput)
		}
		return out, err
	}
	// 2) 若关联了规则链，执行规则链
	if skill.RuleChainID != "" && RuleChainExecutor != nil {
		return RuleChainExecutor(ctx, skill.RuleChainID, userInput)
	}
	// 3) 否则用技能正文做系统提示再问一轮 LLM（仅生成文本，不执行外部命令）
	return e.client.ChatWithSystem(ctx, skill.Content, userInput)
}

// runSkillCommand 在 dir 下执行 command（通过 sh -c），将 input 作为标准输入，返回标准输出与错误。
// 执行过程中会按行将 stdout/stderr 实时打印到日志 [llm] skill stdout / [llm] skill stderr，便于确认技能是否在运行及进度。
func runSkillCommand(ctx context.Context, dir, command, input string) (string, error) {
	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	cmd.Dir = dir
	cmd.Stdin = strings.NewReader(input)

	var outBuf bytes.Buffer
	stdoutLog := &lineLogWriter{prefix: "[llm] skill stdout"}
	stderrLog := &lineLogWriter{prefix: "[llm] skill stderr"}
	cmd.Stdout = io.MultiWriter(&outBuf, stdoutLog)
	cmd.Stderr = io.MultiWriter(&outBuf, stderrLog)

	log.Printf("[llm] skill command 开始 command=%q dir=%q", command, dir)
	err := cmd.Run()
	stdoutLog.Flush()
	stderrLog.Flush()
	log.Printf("[llm] skill command 结束 exitErr=%v outputLen=%d", err, outBuf.Len())

	if err != nil && outBuf.Len() > 0 {
		preview := outBuf.String()
		if len(preview) > 800 {
			preview = preview[:800] + "..."
		}
		preview = strings.TrimSpace(strings.ReplaceAll(preview, "\n", " | "))
		log.Printf("[llm] skill command 失败 output_preview=%s", preview)
	}
	if err != nil {
		return strings.TrimSpace(outBuf.String()) + "\n\nerror: " + err.Error(), err
	}
	return strings.TrimSpace(outBuf.String()), nil
}

func exitCodeOf(err error) int {
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		return ee.ExitCode()
	}
	return -1
}
