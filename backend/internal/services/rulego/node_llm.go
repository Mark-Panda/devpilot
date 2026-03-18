package rulego

import (
	"context"
	"encoding/json"
	"log"
	"strings"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/tmc/langchaingo/llms"

	"devpilot/backend/internal/llm"
)

// LLMNode 大模型节点，与 RuleGo 官方 ai/llm 配置兼容，见 https://rulego.cc/pages/llm/
// 使用 backend/internal/llm（langchaingo），支持 skill_dir、mcp 扩展。
type LLMNode struct {
	client *llm.Client
	config *llm.NodeConfig
}

func (n *LLMNode) Type() string {
	return "ai/llm"
}

func (n *LLMNode) New() types.Node {
	return &LLMNode{}
}

func (n *LLMNode) Init(ruleConfig types.Config, configuration types.Configuration) error {
	var nc llm.NodeConfig
	if err := mapToNodeConfig(configuration, &nc); err != nil {
		return err
	}
	nc.URL = strings.TrimSpace(nc.URL)
	if nc.URL == "" {
		nc.URL = llm.DefaultLLMURL
	}
	nc.Key = strings.TrimSpace(nc.Key)
	nc.Model = strings.TrimSpace(nc.Model)
	if nc.Key == "" || nc.Model == "" {
		return llm.ErrInvalidConfig
	}
	cfg := llm.NodeConfigToConfig(&nc)
	client, err := llm.NewClient(context.Background(), cfg)
	if err != nil {
		return err
	}
	n.client = client
	n.config = &nc
	return nil
}

func (n *LLMNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	substitute := buildSubstituteFromMsg(msg)
	var messages []llms.MessageContent
	if len(n.config.Messages) > 0 {
		messages = llm.BuildMessageContentFromNodeConfig(n.config, substitute)
	} else {
		// 未配置 messages 时：systemPrompt（可选）+ 单条或多轮消息（来自 msg.Data）
		if n.config.SystemPrompt != "" {
			system := llm.ReplacePlaceholders(n.config.SystemPrompt, substitute)
			messages = append(messages, llms.MessageContent{
				Role:  llms.ChatMessageTypeSystem,
				Parts: []llms.ContentPart{llms.TextContent{Text: system}},
			})
		}
		userContent, withHistory := parseUserInputAndHistory(msg.GetData())
		if len(withHistory) > 0 {
			for _, h := range withHistory {
				role := llms.ChatMessageTypeHuman
				if strings.EqualFold(strings.TrimSpace(h.Role), "assistant") {
					role = llms.ChatMessageTypeAI
				}
				text := strings.TrimSpace(h.Content)
				if text == "" {
					text = " "
				}
				messages = append(messages, llms.MessageContent{
					Role:  role,
					Parts: []llms.ContentPart{llms.TextContent{Text: text}},
				})
			}
		}
		if userContent == "" {
			userContent = " "
		}
		messages = append(messages, llms.MessageContent{
			Role:  llms.ChatMessageTypeHuman,
			Parts: []llms.ContentPart{llms.TextContent{Text: userContent}},
		})
	}
	// 注入 Skill 系统提示，并支持“识别到即执行”：勾选启用的技能同时作为 tools，模型返回 tool_calls 时执行子轮 LLM
	skills := n.client.Skills()
	if len(n.config.EnabledSkillNames) > 0 && len(skills) > 0 {
		skills = llm.FilterSkillsByNames(skills, n.config.EnabledSkillNames)
	} else if len(n.config.EnabledSkillNames) == 0 {
		skills = nil
	}
	if len(skills) > 0 {
		skillPrompt := llm.BuildSkillSystemPrompt(skills, true)
		messages = prependOrMergeSkillSystemPrompt(messages, skillPrompt)
	}
	// 请求前打印配置便于排查 401 等错误（apiKey 脱敏）
	log.Printf("[rulego] ai/llm request: baseUrl=%q apiKey=%s model=%q", n.config.URL, maskAPIKey(n.config.Key), n.config.Model)
	if len(skills) > 0 {
		names := make([]string, 0, len(skills))
		for _, s := range skills {
			names = append(names, s.Name)
		}
		log.Printf("[rulego] ai/llm 已启用 %d 个技能，等待模型可能的 tool 调用: %v", len(skills), names)
	}
	opts := llm.CallOptionsFromParams(n.config.Params)
	var result string
	var err error
	// 使用 Background 避免被上层取消：技能执行（如 API 追踪）可能需 1–3 分钟，必须等待完成后再返回结果。
	if len(skills) > 0 {
		tools := llm.SkillsToTools(skills)
		executor := llm.NewSkillExecutor(n.client, skills)
		result, err = n.client.GenerateWithToolLoop(context.Background(), messages, tools, opts, executor, llm.DefaultToolLoopMaxRounds)
	} else {
		result, err = n.client.GenerateFromMessagesWithOptions(context.Background(), messages, opts)
	}
	if err != nil {
		log.Printf("[rulego] ai/llm node error: %v", err)
		ctx.TellFailure(msg, err)
		return
	}
	msg.SetData(result)
	ctx.TellSuccess(msg)
}

func (n *LLMNode) Destroy() {
	n.client = nil
	n.config = nil
}

// parseUserInputAndHistory 解析 msg.Data：若为 JSON 且含 conversation_history 与 data/current_input，返回本轮用户输入与历史消息列表，用于多轮对话。
// 若仅含 data 或非 JSON，返回单条用户内容，history 为空。
func parseUserInputAndHistory(raw string) (currentInput string, history []struct{ Role, Content string }) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	var parsed struct {
		Data                string `json:"data"`
		CurrentInput        string `json:"current_input"`
		ConversationHistory []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"conversation_history"`
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		// 非 JSON 或格式不符：整段作为单条用户消息；若形如 {"data": "..."} 的单一 key 也在此处被解析
		if strings.HasPrefix(raw, "{") && strings.HasSuffix(raw, "}") {
			var simple struct {
				Data string `json:"data"`
			}
			if json.Unmarshal([]byte(raw), &simple) == nil && simple.Data != "" {
				return strings.TrimSpace(simple.Data), nil
			}
		}
		return raw, nil
	}
	currentInput = strings.TrimSpace(parsed.CurrentInput)
	if currentInput == "" {
		currentInput = strings.TrimSpace(parsed.Data)
	}
	if len(parsed.ConversationHistory) == 0 {
		if currentInput == "" {
			currentInput = raw
		}
		return currentInput, nil
	}
	for _, h := range parsed.ConversationHistory {
		history = append(history, struct{ Role, Content string }{Role: h.Role, Content: h.Content})
	}
	return currentInput, history
}

func mapToNodeConfig(m types.Configuration, nc *llm.NodeConfig) error {
	data, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, nc)
}

func buildSubstituteFromMsg(msg types.RuleMsg) map[string]string {
	if msg.Metadata == nil {
		return nil
	}
	return msg.Metadata.GetReadOnlyValues()
}

// maskAPIKey 脱敏 API Key 用于日志：前 6 位 + *** + 后 4 位，便于排查配置错误又避免泄露。
func maskAPIKey(key string) string {
	k := strings.TrimSpace(key)
	if len(k) <= 10 {
		if k == "" {
			return "<empty>"
		}
		return "***"
	}
	return k[:6] + "***" + k[len(k)-4:]
}

// prependOrMergeSkillSystemPrompt 将 skill 系统提示并入 messages。
// 若首条为 system，则把 skillPrompt 与现有内容合并；否则在开头插入一条 system 消息。
func prependOrMergeSkillSystemPrompt(messages []llms.MessageContent, skillPrompt string) []llms.MessageContent {
	if skillPrompt == "" || len(messages) == 0 {
		return messages
	}
	if messages[0].Role == llms.ChatMessageTypeSystem && len(messages[0].Parts) > 0 {
		if t, ok := messages[0].Parts[0].(llms.TextContent); ok {
			merged := skillPrompt + "\n\n" + t.Text
			out := make([]llms.MessageContent, len(messages))
			copy(out, messages)
			out[0] = llms.MessageContent{
				Role:  llms.ChatMessageTypeSystem,
				Parts: []llms.ContentPart{llms.TextContent{Text: merged}},
			}
			return out
		}
	}
	// 开头不是 system 或无法合并，则在最前插入一条 system
	out := make([]llms.MessageContent, 0, len(messages)+1)
	out = append(out, llms.MessageContent{
		Role:  llms.ChatMessageTypeSystem,
		Parts: []llms.ContentPart{llms.TextContent{Text: skillPrompt}},
	})
	out = append(out, messages...)
	return out
}

func init() {
	rulego.Registry.Register(&LLMNode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s", (&LLMNode{}).Type())
}
