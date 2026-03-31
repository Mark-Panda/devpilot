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
	// 若配置了 AfterRound，则由回调返回值覆盖（回调返回空字符串时回退到本字段）。
	ContinuationPrompt string
	// AfterRound 每轮成功后、进入下一轮前调用；nil 时行为与仅使用 ContinuationPrompt 一致。
	AfterRound AfterRoundFunc
	// DialogTask 标识所属规则执行（来自消息 metadata），供弹窗展示。
	DialogTask DialogTask
	// NewSession 非空时覆盖默认的 Cwd/Mode（仍可将 Cwd 留空以使用 AgentLoopParams.Cwd）。
	NewSession *NewSessionParams
	// OnStreamProgress 在 session/prompt 过程中收到流式文本时调用（combined 为已结束轮次 + 当前轮拼接预览）；应极轻量，避免阻塞读循环。
	OnStreamProgress func(combinedPreview string)
}

// AgentLoopResult 多轮执行汇总。
type AgentLoopResult struct {
	Rounds         int
	StopReason     string
	CombinedText   string
	LastPrompt     *PromptResult
	LastStreamText string
	// StderrTail 为 Cursor CLI 子进程 stderr 保留尾部，便于在执行日志中查看进度与报错。
	StderrTail string
}

// RunAgentLoop 启动 agent acp、握手、建会话后，在同一 session 内循环 session/prompt 直至达到轮次上限、遭遇 refusal/cancelled，
// 或 AfterRound 返回 Stop（StopReason 为 user_end / end_marker 等）。
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

	clientCfg := cfg
	clientCfg.RPCInteractionCtx = ctx
	clientCfg.DialogTask = p.DialogTask
	cl := NewClient(clientCfg)
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
	roundPrompt := strings.TrimSpace(p.InitialPrompt)

	for i := 0; i < maxR; i++ {
		current := roundPrompt
		if i > 0 && p.AfterRound == nil {
			current = cont
		}
		if strings.TrimSpace(current) == "" {
			current = cont
		}
		if cfg.VerboseLog {
			preview := strings.TrimSpace(current)
			if len(preview) > 160 {
				preview = preview[:160] + "…"
			}
			log.Printf("[cursoracp] cursor/acp_agent prompt round %d/%d promptChars=%d preview=%q", i+1, maxR, len(current), preview)
		}
		if p.OnStreamProgress != nil {
			cl.SetOnChunk(func(_ string) {
				cur := cl.StreamText()
				var preview strings.Builder
				base := combined.String()
				preview.WriteString(base)
				if base != "" && strings.TrimSpace(cur) != "" {
					preview.WriteString("\n\n---\n\n")
				}
				preview.WriteString(cur)
				s := preview.String()
				if strings.TrimSpace(s) != "" {
					p.OnStreamProgress(s)
				}
			})
		} else {
			cl.SetOnChunk(nil)
		}
		pr, err := cl.Prompt(ctx, sid, current)
		cl.SetOnChunk(nil)
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
			return withAgentStderr(cl, &AgentLoopResult{
				Rounds:         i + 1,
				StopReason:     sr,
				CombinedText:   combined.String(),
				LastPrompt:     pr,
				LastStreamText: chunk,
			}), fmt.Errorf("cursoracp: agent stopReason=%s", sr)
		}

		if i >= maxR-1 {
			break
		}

		if p.AfterRound != nil {
			out, err := p.AfterRound(ctx, AfterRoundInfo{
				DialogTask:     p.DialogTask,
				Round:          i,
				MaxRounds:      maxR,
				SessionID:      sid,
				Cwd:            ns.Cwd,
				LastStreamText: chunk,
				LastPrompt:     pr,
			})
			if err != nil {
				return nil, err
			}
			if out.Stop {
				sr := strings.TrimSpace(out.StopReason)
				if sr != "end_marker" {
					sr = "user_end"
				}
				return withAgentStderr(cl, &AgentLoopResult{
					Rounds:         i + 1,
					StopReason:     sr,
					CombinedText:   combined.String(),
					LastPrompt:     pr,
					LastStreamText: chunk,
				}), nil
			}
			roundPrompt = strings.TrimSpace(out.NextPrompt)
			if roundPrompt == "" {
				roundPrompt = cont
			}
		} else {
			roundPrompt = cont
		}
	}
	return withAgentStderr(cl, &AgentLoopResult{
		Rounds:         maxR,
		StopReason:     strings.TrimSpace(last.StopReason),
		CombinedText:   combined.String(),
		LastPrompt:     last,
		LastStreamText: lastStream,
	}), nil
}

func withAgentStderr(cl *Client, r *AgentLoopResult) *AgentLoopResult {
	if r != nil && cl != nil {
		r.StderrTail = cl.StderrTail()
	}
	return r
}
