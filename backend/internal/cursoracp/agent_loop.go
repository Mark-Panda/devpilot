package cursoracp

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
)

// defaultAgentContinuation 为多轮 session/prompt 时第 2 轮及以后的默认跟进语（自动化场景下替代人工「请继续」）。
const defaultAgentContinuation = "请基于当前上下文继续执行，直到本次任务目标完成；不要停下来等待人工确认。"

// AgentLoopParams 多轮 ACP 会话参数（同一 sessionId、同一子进程内连续 session/prompt）。
type AgentLoopParams struct {
	Cwd           string
	InitialPrompt string
	// MaxPromptRounds 最大 prompt 次数（含首轮）；<=0 时默认 20。
	MaxPromptRounds int
	// ContinuationPrompt 第 2 轮及以后发送的文本；空则使用 defaultAgentContinuation。
	ContinuationPrompt string
	// NewSession 非空时覆盖默认的 Cwd/Mode（仍可将 Cwd 留空以使用 AgentLoopParams.Cwd）。
	NewSession *NewSessionParams
}

// AgentLoopResult 多轮执行汇总。
type AgentLoopResult struct {
	Rounds         int
	StopReason     string
	CombinedText   string
	LastPrompt     *PromptResult
	LastStreamText string
}

// RunAgentLoop 启动 agent acp、握手、建会话后，在同一 session 内循环 session/prompt 直至达到轮次上限或遭遇 refusal/cancelled。
// 会话内的权限、规划确认、elicitation、cursor/* 等由 Client 读循环自动批复（见 Config）。
func RunAgentLoop(ctx context.Context, cfg Config, p AgentLoopParams) (*AgentLoopResult, error) {
	if strings.TrimSpace(p.Cwd) == "" {
		return nil, errors.New("cursoracp: agent loop cwd empty")
	}
	if strings.TrimSpace(p.InitialPrompt) == "" {
		return nil, errors.New("cursoracp: agent loop initial prompt empty")
	}
	maxR := p.MaxPromptRounds
	if maxR <= 0 {
		maxR = 20
	}
	cont := strings.TrimSpace(p.ContinuationPrompt)
	if cont == "" {
		cont = defaultAgentContinuation
	}

	cl := NewClient(cfg)
	if err := cl.Start(ctx); err != nil {
		return nil, err
	}
	defer func() { _ = cl.Close() }()

	if err := cl.Initialize(ctx); err != nil {
		return nil, fmt.Errorf("initialize: %w", err)
	}
	if err := cl.Authenticate(ctx); err != nil {
		return nil, fmt.Errorf("authenticate: %w", err)
	}

	var ns NewSessionParams
	if p.NewSession != nil {
		ns = *p.NewSession
	}
	if strings.TrimSpace(ns.Cwd) == "" {
		ns.Cwd = p.Cwd
	}
	if strings.TrimSpace(ns.Mode) == "" {
		ns.Mode = strings.TrimSpace(cfg.SessionMode)
	}
	if cfg.VerboseLog {
		logWorkspaceCwd("cursor/acp_agent", ns.Cwd)
	}
	sid, err := cl.NewSession(ctx, ns)
	if err != nil {
		return nil, fmt.Errorf("session/new: %w", err)
	}
	if cfg.VerboseLog {
		log.Printf("[cursoracp] cursor/acp_agent sessionId=%s maxPromptRounds=%d", sid, maxR)
	}

	var combined strings.Builder
	var last *PromptResult
	var lastStream string
	for i := 0; i < maxR; i++ {
		current := p.InitialPrompt
		if i > 0 {
			current = cont
		}
		if cfg.VerboseLog {
			preview := strings.TrimSpace(current)
			if len(preview) > 160 {
				preview = preview[:160] + "…"
			}
			log.Printf("[cursoracp] cursor/acp_agent prompt round %d/%d promptChars=%d preview=%q", i+1, maxR, len(current), preview)
		}
		pr, err := cl.Prompt(ctx, sid, current)
		if err != nil {
			return nil, fmt.Errorf("session/prompt round %d: %w", i+1, err)
		}
		last = pr
		chunk := cl.StreamText()
		lastStream = chunk
		if cfg.VerboseLog {
			log.Printf("[cursoracp] cursor/acp_agent round %d/%d stopReason=%q streamChars=%d", i+1, maxR, strings.TrimSpace(pr.StopReason), len(chunk))
		}
		if i > 0 && combined.Len() > 0 && strings.TrimSpace(chunk) != "" {
			combined.WriteString("\n\n---\n\n")
		}
		combined.WriteString(chunk)
		sr := strings.TrimSpace(pr.StopReason)
		if sr == "refusal" || sr == "cancelled" {
			return &AgentLoopResult{
				Rounds:         i + 1,
				StopReason:     sr,
				CombinedText:   combined.String(),
				LastPrompt:     pr,
				LastStreamText: chunk,
			}, fmt.Errorf("cursoracp: agent stopReason=%s", sr)
		}
	}
	return &AgentLoopResult{
		Rounds:         maxR,
		StopReason:     strings.TrimSpace(last.StopReason),
		CombinedText:   combined.String(),
		LastPrompt:     last,
		LastStreamText: lastStream,
	}, nil
}
