package rulego

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/volcengine/volc-sdk-golang/service/tls"
)

// VolcTlsSearchLogsNode 调用火山引擎日志服务 TLS SearchLogs / SearchLogsV2 检索日志。
// 文档：https://www.volcengine.com/docs/6470/112195
type VolcTlsSearchLogsNode struct {
	cfg volcTlsSearchLogsConfig
}

type volcTlsSearchLogsConfig struct {
	Endpoint       string `json:"endpoint"`
	Region         string `json:"region"`
	AccessKeyID    string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
	SessionToken   string `json:"sessionToken"`
	TopicID        string `json:"topicId"`
	DefaultQuery   string `json:"defaultQuery"`
	Limit          int    `json:"limit"`
	UseAPIV3       bool   `json:"useApiV3"`
	TimeoutSec     int    `json:"timeoutSec"`
}

func (n *VolcTlsSearchLogsNode) Type() string { return "volcTls/searchLogs" }

func (n *VolcTlsSearchLogsNode) New() types.Node { return &VolcTlsSearchLogsNode{} }

func (n *VolcTlsSearchLogsNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := mapConfigurationToStruct(configuration, &n.cfg); err != nil {
		return err
	}
	n.cfg.Endpoint = strings.TrimSpace(n.cfg.Endpoint)
	n.cfg.Region = strings.TrimSpace(n.cfg.Region)
	n.cfg.AccessKeyID = strings.TrimSpace(n.cfg.AccessKeyID)
	n.cfg.SecretAccessKey = strings.TrimSpace(n.cfg.SecretAccessKey)
	n.cfg.SessionToken = strings.TrimSpace(n.cfg.SessionToken)
	n.cfg.TopicID = strings.TrimSpace(n.cfg.TopicID)
	n.cfg.DefaultQuery = strings.TrimSpace(n.cfg.DefaultQuery)
	if n.cfg.DefaultQuery == "" {
		n.cfg.DefaultQuery = "*"
	}
	if n.cfg.Limit <= 0 {
		n.cfg.Limit = 100
	}
	if n.cfg.Limit > 500 {
		n.cfg.Limit = 500
	}
	if n.cfg.TimeoutSec <= 0 {
		n.cfg.TimeoutSec = 60
	}
	if n.cfg.AccessKeyID == "" || n.cfg.SecretAccessKey == "" {
		return errors.New("volcTls/searchLogs: accessKeyId 与 secretAccessKey 不能为空")
	}
	if n.cfg.Region == "" {
		return errors.New("volcTls/searchLogs: region 不能为空（如 cn-beijing）")
	}
	if n.cfg.TopicID == "" {
		return errors.New("volcTls/searchLogs: topicId 不能为空")
	}
	return nil
}

type volcTlsSearchMsg struct {
	Query     string `json:"query"`
	StartTime int64  `json:"startTime"`
	EndTime   int64  `json:"endTime"`
	TopicID   string `json:"topicId"`
	Context   string `json:"context"`
	Sort      string `json:"sort"`
	HighLight *bool  `json:"highLight"`
}

func resolveVolcTlsSearch(msgData string, topicDefault, queryDefault string) (volcTlsSearchMsg, error) {
	now := time.Now().UnixMilli()
	out := volcTlsSearchMsg{
		Query:     queryDefault,
		StartTime: now - 15*60*1000,
		EndTime:   now,
		TopicID:   topicDefault,
		Sort:      "desc",
	}
	msgData = strings.TrimSpace(msgData)
	if msgData == "" {
		return out, nil
	}
	var raw volcTlsSearchMsg
	if err := json.Unmarshal([]byte(msgData), &raw); err != nil {
		out.Query = msgData
		return out, nil
	}
	if strings.TrimSpace(raw.Query) != "" {
		out.Query = strings.TrimSpace(raw.Query)
	}
	if raw.StartTime > 0 {
		out.StartTime = raw.StartTime
	}
	if raw.EndTime > 0 {
		out.EndTime = raw.EndTime
	}
	if strings.TrimSpace(raw.TopicID) != "" {
		out.TopicID = strings.TrimSpace(raw.TopicID)
	}
	if raw.Context != "" {
		out.Context = raw.Context
	}
	if strings.TrimSpace(raw.Sort) != "" {
		out.Sort = strings.TrimSpace(raw.Sort)
	}
	if raw.HighLight != nil {
		out.HighLight = raw.HighLight
	}
	if out.TopicID == "" {
		return volcTlsSearchMsg{}, errors.New("volcTls/searchLogs: topicId 为空（请在节点配置或消息 JSON 中提供 topicId）")
	}
	if out.Query == "" {
		out.Query = "*"
	}
	if out.EndTime < out.StartTime {
		return volcTlsSearchMsg{}, errors.New("volcTls/searchLogs: endTime 不能小于 startTime")
	}
	return out, nil
}

func tlsEndpointFor(cfg *volcTlsSearchLogsConfig) string {
	if cfg.Endpoint != "" {
		return strings.TrimRight(cfg.Endpoint, "/")
	}
	return fmt.Sprintf("https://tls.%s.volces.com", cfg.Region)
}

func (n *VolcTlsSearchLogsNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	params, err := resolveVolcTlsSearch(msg.GetData(), n.cfg.TopicID, n.cfg.DefaultQuery)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}

	client := tls.NewClient(
		tlsEndpointFor(&n.cfg),
		n.cfg.AccessKeyID,
		n.cfg.SecretAccessKey,
		n.cfg.SessionToken,
		n.cfg.Region,
	)
	client.SetTimeout(time.Duration(n.cfg.TimeoutSec) * time.Second)

	req := &tls.SearchLogsRequest{
		TopicID:   params.TopicID,
		Query:     params.Query,
		StartTime: params.StartTime,
		EndTime:   params.EndTime,
		Limit:     n.cfg.Limit,
		Context:   params.Context,
		Sort:      params.Sort,
	}
	if params.HighLight != nil {
		req.HighLight = *params.HighLight
	}

	ctxCall, cancel := context.WithTimeout(context.Background(), time.Duration(n.cfg.TimeoutSec)*time.Second)
	defer cancel()

	type searchResult struct {
		resp *tls.SearchLogsResponse
		err  error
	}
	ch := make(chan searchResult, 1)
	go func() {
		var resp *tls.SearchLogsResponse
		var e error
		if n.cfg.UseAPIV3 {
			resp, e = client.SearchLogsV2(req)
		} else {
			resp, e = client.SearchLogs(req)
		}
		ch <- searchResult{resp, e}
	}()

	var resp *tls.SearchLogsResponse
	select {
	case <-ctxCall.Done():
		log.Printf("[rulego] volcTls/searchLogs 超时: %v", ctxCall.Err())
		ctx.TellFailure(msg, fmt.Errorf("volcTls/searchLogs: 请求超时（%ds）", n.cfg.TimeoutSec))
		return
	case r := <-ch:
		resp, err = r.resp, r.err
	}
	if err != nil {
		log.Printf("[rulego] volcTls/searchLogs 失败: %v", err)
		ctx.TellFailure(msg, err)
		return
	}

	outBody, err := json.Marshal(resp)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}
	out := msg.Copy()
	if out.Metadata == nil {
		out.Metadata = types.NewMetadata()
	}
	out.Metadata.PutValue("volc_tls_topic_id", params.TopicID)
	out.Metadata.PutValue("volc_tls_query", params.Query)
	out.Metadata.PutValue("volc_tls_hit_count", fmt.Sprintf("%d", resp.HitCount))
	out.SetData(string(outBody))
	ctx.TellSuccess(out)
}

func (n *VolcTlsSearchLogsNode) Destroy() { n.cfg = volcTlsSearchLogsConfig{} }

func init() {
	rulego.Registry.Register(&VolcTlsSearchLogsNode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s", (&VolcTlsSearchLogsNode{}).Type())
}
