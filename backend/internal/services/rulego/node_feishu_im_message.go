package rulego

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/rulego/rulego/components/base"
	"github.com/rulego/rulego/utils/el"
)

// FeishuImMessageNode 向飞书用户发送单聊消息（开放接口 im/v1/messages）。
// 文档：https://open.feishu.cn/document/server-docs/im-v1/message/create
type FeishuImMessageNode struct {
	cfg feishuImMessageConfig

	receiveIDTmpl el.Template
	textTmpl      el.Template

	tokenMu       sync.Mutex
	cachedToken   string
	tokenDeadline time.Time
}

type feishuImMessageConfig struct {
	AppID          string `json:"appId"`
	AppSecret      string `json:"appSecret"`
	ReceiveIDType  string `json:"receiveIdType"`
	ReceiveID      string `json:"receiveId"`
	Text           string `json:"text"`
	TimeoutSec     int    `json:"timeoutSec"`
}

type feishuMsgOverride struct {
	ReceiveID string `json:"receiveId"`
	Text      string `json:"text"`
}

type feishuTenantTokenResp struct {
	Code              int    `json:"code"`
	Msg               string `json:"msg"`
	TenantAccessToken string `json:"tenant_access_token"`
	Expire            int    `json:"expire"`
}

type feishuAPIEnvelope struct {
	Code int             `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

func (n *FeishuImMessageNode) Type() string { return "feishu/imMessage" }

func (n *FeishuImMessageNode) New() types.Node { return &FeishuImMessageNode{} }

func (n *FeishuImMessageNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := mapConfigurationToStruct(configuration, &n.cfg); err != nil {
		return err
	}
	n.cfg.AppID = strings.TrimSpace(n.cfg.AppID)
	n.cfg.AppSecret = strings.TrimSpace(n.cfg.AppSecret)
	n.cfg.ReceiveIDType = strings.TrimSpace(strings.ToLower(n.cfg.ReceiveIDType))
	if n.cfg.ReceiveIDType == "" {
		n.cfg.ReceiveIDType = "open_id"
	}
	if n.cfg.TimeoutSec <= 0 {
		n.cfg.TimeoutSec = 30
	}
	if n.cfg.AppID == "" || n.cfg.AppSecret == "" {
		return errors.New("feishu/imMessage: appId 与 appSecret 不能为空")
	}
	if !feishuReceiveIDTypeOK(n.cfg.ReceiveIDType) {
		return fmt.Errorf("feishu/imMessage: 不支持的 receiveIdType: %s（支持 open_id、union_id、user_id、email）", n.cfg.ReceiveIDType)
	}
	var err error
	n.receiveIDTmpl, err = el.NewTemplate(n.cfg.ReceiveID)
	if err != nil {
		return fmt.Errorf("feishu/imMessage: receiveId 模板: %w", err)
	}
	textDefault := strings.TrimSpace(n.cfg.Text)
	if textDefault == "" {
		textDefault = "${data}"
	}
	n.textTmpl, err = el.NewTemplate(textDefault)
	if err != nil {
		return fmt.Errorf("feishu/imMessage: text 模板: %w", err)
	}
	return nil
}

func feishuReceiveIDTypeOK(t string) bool {
	switch t {
	case "open_id", "union_id", "user_id", "email":
		return true
	default:
		return false
	}
}

func (n *FeishuImMessageNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	receiveID := strings.TrimSpace(n.receiveIDTmpl.ExecuteAsString(env))
	text := strings.TrimSpace(n.textTmpl.ExecuteAsString(env))

	raw := strings.TrimSpace(msg.GetData())
	if raw != "" {
		var ov feishuMsgOverride
		if err := json.Unmarshal([]byte(raw), &ov); err == nil {
			if strings.TrimSpace(ov.ReceiveID) != "" {
				receiveID = strings.TrimSpace(ov.ReceiveID)
			}
			if strings.TrimSpace(ov.Text) != "" {
				text = strings.TrimSpace(ov.Text)
			}
		} else {
			text = raw
		}
	}

	if receiveID == "" {
		ctx.TellFailure(msg, errors.New("feishu/imMessage: receiveId 为空（请在节点配置或消息 JSON {\"receiveId\":\"…\"} 中提供）"))
		return
	}
	if text == "" {
		ctx.TellFailure(msg, errors.New("feishu/imMessage: 消息正文 text 为空"))
		return
	}

	httpClient := &http.Client{Timeout: time.Duration(n.cfg.TimeoutSec) * time.Second}
	callCtx, cancel := context.WithTimeout(context.Background(), time.Duration(n.cfg.TimeoutSec)*time.Second)
	defer cancel()

	token, err := n.tenantAccessToken(callCtx, httpClient)
	if err != nil {
		log.Printf("[rulego] feishu/imMessage 获取 tenant_access_token 失败: %v", err)
		ctx.TellFailure(msg, err)
		return
	}

	contentObj := map[string]string{"text": text}
	contentBytes, err := json.Marshal(contentObj)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}
	body := map[string]string{
		"receive_id": receiveID,
		"msg_type":   "text",
		"content":    string(contentBytes),
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}

	u := "https://open.feishu.cn/open-apis/im/v1/messages?" + url.Values{
		"receive_id_type": {n.cfg.ReceiveIDType},
	}.Encode()
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, u, bytes.NewReader(bodyBytes))
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := httpClient.Do(req)
	if err != nil {
		log.Printf("[rulego] feishu/imMessage 请求失败: %v", err)
		ctx.TellFailure(msg, fmt.Errorf("feishu/imMessage: %w", err))
		return
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		ctx.TellFailure(msg, err)
		return
	}

	var envResp feishuAPIEnvelope
	if err := json.Unmarshal(respBody, &envResp); err != nil {
		ctx.TellFailure(msg, fmt.Errorf("feishu/imMessage: 解析响应: %w", err))
		return
	}
	if envResp.Code != 0 {
		ctx.TellFailure(msg, fmt.Errorf("feishu/imMessage: code=%d msg=%s", envResp.Code, envResp.Msg))
		return
	}

	out := msg.Copy()
	if out.Metadata == nil {
		out.Metadata = types.NewMetadata()
	}
	out.Metadata.PutValue("feishu_receive_id", receiveID)
	out.Metadata.PutValue("feishu_receive_id_type", n.cfg.ReceiveIDType)
	out.SetData(string(respBody))
	ctx.TellSuccess(out)
}

func (n *FeishuImMessageNode) tenantAccessToken(ctx context.Context, client *http.Client) (string, error) {
	n.tokenMu.Lock()
	defer n.tokenMu.Unlock()
	if n.cachedToken != "" && time.Now().Before(n.tokenDeadline) {
		return n.cachedToken, nil
	}

	payload, err := json.Marshal(map[string]string{
		"app_id":     n.cfg.AppID,
		"app_secret": n.cfg.AppSecret,
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
		bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	var tr feishuTenantTokenResp
	if err := json.Unmarshal(b, &tr); err != nil {
		return "", fmt.Errorf("解析 token 响应: %w", err)
	}
	if tr.Code != 0 {
		return "", fmt.Errorf("获取 tenant_access_token 失败: code=%d msg=%s", tr.Code, tr.Msg)
	}
	if tr.TenantAccessToken == "" {
		return "", errors.New("tenant_access_token 为空")
	}
	ttl := tr.Expire
	if ttl <= 0 {
		ttl = 3600
	}
	// 提前 120 秒刷新，避免边界过期
	refresh := ttl - 120
	if refresh < 60 {
		refresh = 60
	}
	n.cachedToken = tr.TenantAccessToken
	n.tokenDeadline = time.Now().Add(time.Duration(refresh) * time.Second)
	return n.cachedToken, nil
}

func (n *FeishuImMessageNode) Destroy() {
	n.cfg = feishuImMessageConfig{}
	n.cachedToken = ""
	n.tokenDeadline = time.Time{}
}

func init() {
	rulego.Registry.Register(&FeishuImMessageNode{})
	log.Printf("[rulego] 自定义节点已注册: type=%s", (&FeishuImMessageNode{}).Type())
}
