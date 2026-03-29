package rulego

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"

	"devpilot/backend/internal/store/models"
	"devpilot/backend/internal/store/pebble"
)

// ExecuteRuleOutput 执行规则链的出参
type ExecuteRuleOutput struct {
	Success       bool   `json:"success"`
	Data          string `json:"data"`           // 末端节点产出数据
	Error         string `json:"error"`          // 若失败时的错误信息
	Elapsed       int64  `json:"elapsed"`        // 耗时毫秒
	ExecutionID   string `json:"execution_id"`   // 有执行日志时写入，便于查询节点步骤
}

// ExecuteRuleInput 执行规则链的入参
type ExecuteRuleInput struct {
	MessageType string            `json:"message_type"` // 消息类型，默认 "default"
	Metadata    map[string]string `json:"metadata"`     // 元数据键值
	Data        string            `json:"data"`         // 消息体，通常为 JSON 字符串
}

// StartExecuteRuleResult 异步执行启动后立即返回，供前端轮询 GetExecutionLog
type StartExecuteRuleResult struct {
	ExecutionID string `json:"execution_id"`
}

func (s *Service) finalizeExecutionLogAfterRun(ctx context.Context, execLogID string, lastMsg types.RuleMsg, lastErr error) {
	if s.execLogStore == nil || execLogID == "" {
		return
	}
	finishAt := time.Now().UTC().Format(time.RFC3339)
	outData := ""
	outMeta := "{}"
	if lastErr == nil && lastMsg.GetData() != "" {
		outData = lastMsg.GetData()
		if lastMsg.Metadata != nil {
			outMeta = MetadataToJSON(lastMsg.Metadata.GetReadOnlyValues())
		}
	}
	errStr := ""
	if lastErr != nil {
		errStr = lastErr.Error()
	}
	_ = s.execLogStore.UpdateExecutionLog(ctx, execLogID, outData, outMeta, errStr, finishAt, lastErr == nil)
}

func runOnMsgAndWait(engine types.RuleEngine, msgType string, metadata *types.Metadata, data string) (types.RuleMsg, error) {
	var lastMsg types.RuleMsg
	var lastErr error
	var mu sync.Mutex
	engine.OnMsgAndWait(
		types.NewMsg(time.Now().UnixMilli(), msgType, types.JSON, metadata, data),
		types.WithOnEnd(func(ctx types.RuleContext, msg types.RuleMsg, err error, relationType string) {
			mu.Lock()
			lastMsg = msg
			lastErr = err
			mu.Unlock()
		}),
	)
	return lastMsg, lastErr
}

// StartExecuteRule 在后台执行规则链并立即返回 execution_id；前端可轮询 GetExecutionLog 查看节点级进度与日志。
// 与 ExecuteRule 行为一致，仅非阻塞；未加载到池中的规则会在执行结束后释放临时引擎。
func (s *Service) StartExecuteRule(ruleID string, input ExecuteRuleInput) (StartExecuteRuleResult, error) {
	var zero StartExecuteRuleResult
	if s.execLogStore == nil {
		return zero, errors.New("执行日志不可用，无法启动带进度跟踪的执行")
	}
	ctx := context.Background()
	rule, err := s.store.GetByID(ctx, ruleID)
	if err != nil {
		if errors.Is(err, pebble.ErrNotFound) {
			return zero, errors.New("规则不存在")
		}
		return zero, err
	}
	if !EnabledFromDefinition(rule.Definition) {
		return zero, errors.New("规则已停用")
	}
	if rule.Definition == "" {
		return zero, errors.New("规则定义为空")
	}

	def := rule.Definition
	if s.llmConfigLister != nil {
		if patched, err := PatchDefinitionWithLLMKeys(ctx, def, s.llmConfigLister); err == nil {
			def = patched
		}
	}
	def = AlignDefinitionRuleChainID(def, ruleID)
	defBytes := []byte(def)

	data := input.Data
	if data == "" {
		data = "{}"
	}
	execLog, err := s.execLogStore.CreateExecutionLog(ctx, models.RuleGoExecutionLog{
		RuleID:        ruleID,
		RuleName:      rule.Name,
		TriggerType:   "manual",
		InputData:     data,
		InputMetadata: MetadataToJSON(input.Metadata),
	})
	if err != nil || execLog.ID == "" {
		return zero, errors.New("创建执行记录失败")
	}

	if existing, ok := rulego.Get(ruleID); ok && existing.Initialized() {
		_ = existing.ReloadSelf(defBytes, ruleEngineOpts(&LogAspect{})...)
		go s.runExecuteRuleInBackground(existing, ruleID, input, execLog.ID, true)
		return StartExecuteRuleResult{ExecutionID: execLog.ID}, nil
	}
	engine, createErr := rulego.New(ruleID, defBytes, ruleEngineOpts(&LogAspect{})...)
	if createErr != nil {
		return zero, createErr
	}
	go s.runExecuteRuleInBackground(engine, ruleID, input, execLog.ID, false)
	return StartExecuteRuleResult{ExecutionID: execLog.ID}, nil
}

func (s *Service) runExecuteRuleInBackground(engine types.RuleEngine, ruleID string, input ExecuteRuleInput, execLogID string, fromPool bool) {
	defer func() {
		if !fromPool {
			engine.Stop(nil)
			rulego.Del(ruleID)
		}
	}()
	ctx := context.Background()
	metadata := types.NewMetadata()
	for k, v := range input.Metadata {
		metadata.PutValue(k, v)
	}
	metadata.PutValue("_execution_id", execLogID)
	data := input.Data
	if data == "" {
		data = "{}"
	}
	msgType := input.MessageType
	if msgType == "" {
		msgType = "default"
	}
	start := time.Now()
	lastMsg, lastErr := runOnMsgAndWait(engine, msgType, metadata, data)
	_ = time.Since(start).Milliseconds()
	s.finalizeExecutionLogAfterRun(ctx, execLogID, lastMsg, lastErr)
}

// ExecuteRule 根据规则 ID 同步执行一次规则链，返回末端结果或错误。
// 若该规则链已通过 LoadRuleChain/LoadAllEnabledRuleChains 加载到池中，则直接使用池中引擎；否则按需创建并执行后释放。
func (s *Service) ExecuteRule(ruleID string, input ExecuteRuleInput) (ExecuteRuleOutput, error) {
	ctx := context.Background()
	rule, err := s.store.GetByID(ctx, ruleID)
	if err != nil {
		if errors.Is(err, pebble.ErrNotFound) {
			return ExecuteRuleOutput{Success: false, Error: "规则不存在"}, err
		}
		return ExecuteRuleOutput{Success: false, Error: err.Error()}, err
	}
	if !EnabledFromDefinition(rule.Definition) {
		return ExecuteRuleOutput{Success: false, Error: "规则已停用"}, errors.New("rule disabled")
	}
	if rule.Definition == "" {
		return ExecuteRuleOutput{Success: false, Error: "规则定义为空"}, errors.New("empty definition")
	}

	def := rule.Definition
	if s.llmConfigLister != nil {
		if patched, err := PatchDefinitionWithLLMKeys(ctx, def, s.llmConfigLister); err == nil {
			def = patched
		}
	}
	def = AlignDefinitionRuleChainID(def, ruleID)
	defBytes := []byte(def)
	var engine types.RuleEngine
	if existing, ok := rulego.Get(ruleID); ok && existing.Initialized() {
		// 已加载的引擎用当前（可能已 patch key）的 definition 重载，保证使用最新模型配置
		_ = existing.ReloadSelf(defBytes, ruleEngineOpts(&LogAspect{})...)
		engine = existing
	} else {
		var createErr error
		engine, createErr = rulego.New(ruleID, defBytes, ruleEngineOpts(&LogAspect{})...)
		if createErr != nil {
			return ExecuteRuleOutput{Success: false, Error: createErr.Error()}, createErr
		}
		defer engine.Stop(nil)
	}

	msgType := input.MessageType
	if msgType == "" {
		msgType = "default"
	}
	metadata := types.NewMetadata()
	for k, v := range input.Metadata {
		metadata.PutValue(k, v)
	}
	data := input.Data
	if data == "" {
		data = "{}"
	}

	var execLog models.RuleGoExecutionLog
	if s.execLogStore != nil {
		execLog, _ = s.execLogStore.CreateExecutionLog(ctx, models.RuleGoExecutionLog{
			RuleID:        ruleID,
			RuleName:      rule.Name,
			TriggerType:   "manual",
			InputData:     data,
			InputMetadata: MetadataToJSON(input.Metadata),
		})
		metadata.PutValue("_execution_id", execLog.ID)
	}

	start := time.Now()
	lastMsg, lastErr := runOnMsgAndWait(engine, msgType, metadata, data)
	elapsed := time.Since(start).Milliseconds()

	s.finalizeExecutionLogAfterRun(ctx, execLog.ID, lastMsg, lastErr)

	out := ExecuteRuleOutput{Elapsed: elapsed, ExecutionID: execLog.ID}
	if lastErr != nil {
		out.Success = false
		out.Error = lastErr.Error()
		return out, nil
	}
	out.Success = true
	out.Data = lastMsg.GetData()
	return out, nil
}

// ExecuteRuleDefinition 使用给定的规则链定义 JSON 同步执行一次（模拟测试），不写入数据库。
// 用于可视化编辑器中“测试”按钮：对当前画布内容进行调试运行。
// 会阻塞直至整条规则链执行完毕（含 ai/llm 节点的多轮 tool 调用与技能执行）；若启用了技能，可能需数分钟，调用方应避免超时或断开。
func (s *Service) ExecuteRuleDefinition(definition string, input ExecuteRuleInput) (ExecuteRuleOutput, error) {
	ctx := context.Background()
	def := definition
	if def == "" {
		return ExecuteRuleOutput{Success: false, Error: "规则定义为空"}, errors.New("empty definition")
	}
	if json.Unmarshal([]byte(def), &map[string]interface{}{}) != nil {
		return ExecuteRuleOutput{Success: false, Error: "规则定义不是合法 JSON"}, errors.New("invalid definition json")
	}
	if s.llmConfigLister != nil {
		if patched, err := PatchDefinitionWithLLMKeys(ctx, def, s.llmConfigLister); err == nil {
			def = patched
		}
	}
	const testRuleID = "_test_"
	def = AlignDefinitionRuleChainID(def, testRuleID)
	engine, createErr := rulego.New(testRuleID, []byte(def), ruleEngineOpts(&LogAspect{})...)
	if createErr != nil {
		return ExecuteRuleOutput{Success: false, Error: createErr.Error()}, createErr
	}
	defer func() {
		engine.Stop(nil)
		rulego.Del(testRuleID)
	}()

	msgType := input.MessageType
	if msgType == "" {
		msgType = "default"
	}
	metadata := types.NewMetadata()
	for k, v := range input.Metadata {
		metadata.PutValue(k, v)
	}
	data := input.Data
	if data == "" {
		data = "{}"
	}

	var execLog models.RuleGoExecutionLog
	if s.execLogStore != nil {
		execLog, _ = s.execLogStore.CreateExecutionLog(ctx, models.RuleGoExecutionLog{
			RuleID:        testRuleID,
			RuleName:      "测试执行",
			TriggerType:   "test",
			InputData:     data,
			InputMetadata: MetadataToJSON(input.Metadata),
		})
		metadata.PutValue("_execution_id", execLog.ID)
	}

	start := time.Now()
	lastMsg, lastErr := runOnMsgAndWait(engine, msgType, metadata, data)
	elapsed := time.Since(start).Milliseconds()

	s.finalizeExecutionLogAfterRun(ctx, execLog.ID, lastMsg, lastErr)

	out := ExecuteRuleOutput{Elapsed: elapsed, ExecutionID: execLog.ID}
	if lastErr != nil {
		out.Success = false
		out.Error = lastErr.Error()
		return out, nil
	}
	out.Success = true
	out.Data = lastMsg.GetData()
	return out, nil
}

// ValidateRuleDefinition 校验规则链定义 JSON 是否可被 rulego 加载，不执行。
func (s *Service) ValidateRuleDefinition(definition string) error {
	if definition == "" {
		return errors.New("definition is required")
	}
	if err := json.Unmarshal([]byte(definition), &map[string]interface{}{}); err != nil {
		return err
	}
	definition = AlignDefinitionRuleChainID(definition, "_validate_")
	eng, err := rulego.New("_validate_", []byte(definition), ruleEngineOpts()...)
	if err != nil {
		return err
	}
	eng.Stop(nil)
	rulego.Del("_validate_")
	return nil
}
