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
		// 未配置 messages 时：systemPrompt（可选）+ 单条用户消息（来自 msg.Data）
		if n.config.SystemPrompt != "" {
			system := replacePlaceholders(n.config.SystemPrompt, substitute)
			messages = append(messages, llms.MessageContent{
				Role:  llms.ChatMessageTypeSystem,
				Parts: []llms.ContentPart{llms.TextContent{Text: system}},
			})
		}
		userContent := msg.GetData()
		if userContent == "" {
			userContent = " "
		}
		messages = append(messages, llms.MessageContent{
			Role:  llms.ChatMessageTypeHuman,
			Parts: []llms.ContentPart{llms.TextContent{Text: userContent}},
		})
	}
	opts := llm.CallOptionsFromParams(n.config.Params)
	result, err := n.client.GenerateFromMessagesWithOptions(context.Background(), messages, opts)
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

func replacePlaceholders(s string, m map[string]string) string {
	for k, v := range m {
		s = strings.ReplaceAll(s, "${"+k+"}", v)
		s = strings.ReplaceAll(s, "${vars."+k+"}", v)
	}
	return s
}

func init() {
	rulego.Registry.Register(&LLMNode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s", (&LLMNode{}).Type())
}
