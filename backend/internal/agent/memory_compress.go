package agent

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"unicode/utf8"

	"devpilot/backend/internal/llm"
	"github.com/pkoukk/tiktoken-go"
	"github.com/rs/zerolog/log"
	"github.com/tmc/langchaingo/llms"
)

// 记忆压缩：超过 token 阈值时，将较早对话折叠为滚动摘要写入磁盘，并从内存中删除对应轮次。

const (
	// memoryCompressTokenThreshold 记忆（仅 user/assistant 正文）超过该估值则触发压缩（cl100k 优先，失败则用启发式）
	memoryCompressTokenThreshold = 14000
	// memoryKeepRecentPairs 压缩后保留最近若干轮完整对话（每轮 user+assistant 各一条）
	memoryKeepRecentPairs = 8
	// maxSummaryInputRunes 单次交给摘要模型的「待并入」文本上限，避免超长上下文
	maxSummaryInputRunes = 48000
	// maxStoredSummaryRunes 落盘摘要长度上限，防止无限膨胀
	maxStoredSummaryRunes = 16000
	memoryCompressSystemPrompt = `你是对话记忆压缩助手。用户会提供「可选的已有摘要」和「一段较早的多轮对话摘录」。
请输出**唯一一段**更新后的中文摘要：合并旧摘要与新对话中的信息，保留关键事实、用户目标、已达成结论、未决问题与专有名词/路径；不要编造；控制在约 1500 字以内。只输出摘要正文，不要标题或客套话。`
)

var (
	cl100kOnce sync.Once
	cl100kEnc  *tiktoken.Tiktoken
	cl100kErr  error
)

func getCL100K() (*tiktoken.Tiktoken, error) {
	cl100kOnce.Do(func() {
		cl100kEnc, cl100kErr = tiktoken.GetEncoding("cl100k_base")
	})
	return cl100kEnc, cl100kErr
}

func messageTextContent(m llms.MessageContent) string {
	var sb strings.Builder
	for _, p := range m.Parts {
		if tc, ok := p.(llms.TextContent); ok {
			sb.WriteString(tc.Text)
		}
	}
	return sb.String()
}

func joinMessagesForTokenCount(msgs []llms.MessageContent) string {
	var b strings.Builder
	for _, m := range msgs {
		b.WriteString(messageTextContent(m))
		b.WriteByte('\n')
	}
	return b.String()
}

func approximateTokenCountHeuristic(s string) int {
	if s == "" {
		return 0
	}
	r := utf8.RuneCountInString(s)
	b := len(s)
	// 中英混合保守估计，略偏高以减少低估导致的超长上下文
	est := b / 3
	if r > b/2 {
		est = r * 3 / 4
	}
	if est < 1 {
		est = 1
	}
	return est
}

func memoryTokenCount(msgs []llms.MessageContent) int {
	if len(msgs) == 0 {
		return 0
	}
	s := joinMessagesForTokenCount(msgs)
	enc, err := getCL100K()
	if err != nil {
		return approximateTokenCountHeuristic(s)
	}
	return len(enc.Encode(s, nil, nil))
}

func formatMessagesForSummary(msgs []llms.MessageContent) string {
	var b strings.Builder
	for _, m := range msgs {
		role := "用户"
		if m.Role == llms.ChatMessageTypeAI {
			role = "助手"
		}
		text := strings.TrimSpace(messageTextContent(m))
		if text == "" {
			continue
		}
		b.WriteString(role)
		b.WriteString("：")
		b.WriteString(text)
		b.WriteString("\n\n")
	}
	return b.String()
}

func capSummaryStorage(s string) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) <= maxStoredSummaryRunes {
		return string(r)
	}
	return string(r[len(r)-maxStoredSummaryRunes:])
}

// maybeCompressMemory 当记忆超过 token 阈值时：将最早的一段对话并入滚动摘要，只保留最近 memoryKeepRecentPairs 轮。
// 成功时返回 (新记忆切片, 新摘要, nil)；LLM 失败时返回 (nil, "", err)，由调用方回退为仅 trimMemory。
func maybeCompressMemory(ctx context.Context, client *llm.Client, memory []llms.MessageContent, existingSummary string) ([]llms.MessageContent, string, error) {
	if client == nil || len(memory) == 0 {
		return trimMemory(memory), existingSummary, nil
	}
	if memoryTokenCount(memory) <= memoryCompressTokenThreshold {
		return trimMemory(memory), existingSummary, nil
	}

	keepN := memoryKeepRecentPairs * 2
	if len(memory) <= keepN {
		return trimMemory(memory), existingSummary, nil
	}

	prefix := memory[:len(memory)-keepN]
	suffix := memory[len(memory)-keepN:]

	transcript := formatMessagesForSummary(prefix)
	if utf8.RuneCountInString(transcript) > maxSummaryInputRunes {
		r := []rune(transcript)
		transcript = string(r[len(r)-maxSummaryInputRunes:])
	}

	var userBlock strings.Builder
	if strings.TrimSpace(existingSummary) != "" {
		userBlock.WriteString("此前已保存的对话摘要：\n")
		userBlock.WriteString(existingSummary)
		userBlock.WriteString("\n\n下面是需要并入摘要的较早对话（按时间顺序，可能已截断）：\n")
	} else {
		userBlock.WriteString("以下是需要压缩保存的较早对话（按时间顺序，可能已截断）：\n")
	}
	userBlock.WriteString(transcript)

	newSummary, err := client.ChatWithSystem(ctx, memoryCompressSystemPrompt, userBlock.String())
	if err != nil {
		return nil, "", err
	}
	newSummary = strings.TrimSpace(newSummary)
	if newSummary == "" {
		return nil, "", fmt.Errorf("memory compress: empty model summary")
	}
	newSummary = capSummaryStorage(newSummary)

	log.Info().
		Int("dropped_messages", len(prefix)).
		Int("kept_messages", len(suffix)).
		Int("summary_runes", utf8.RuneCountInString(newSummary)).
		Msg("agent memory compressed")

	return trimMemory(suffix), newSummary, nil
}
