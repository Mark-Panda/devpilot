package llm

import (
	"errors"
	"fmt"
	"strings"
)

var (
	ErrInvalidConfig     = errors.New("llm: invalid config (base_url, api_key and model are required)")
	ErrEmptyResponse     = errors.New("llm: empty response from model")
	ErrToolLoopMaxRounds = errors.New("llm: tool loop exceeded max rounds")
	ErrSkillNotFound     = errors.New("llm: skill not found for execution")
)

// FormatErrorForUser 将底层 LLM 接口错误转为对用户更友好的提示（如 401/400/502 等），供 API 与技能生成等复用。
func FormatErrorForUser(err error) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	if strings.Contains(msg, "invalid character") && strings.Contains(msg, "looking for beginning of value") {
		return fmt.Errorf("大模型接口返回了非 JSON 内容（可能是错误页或网关拦截），请检查 baseURL、api_key 及模型名是否正确，或查看网关/服务端日志：%w", err)
	}
	if strings.Contains(msg, "400") || strings.Contains(msg, "Bad Request") {
		return fmt.Errorf("大模型接口返回 400 错误，请检查请求参数或模型名：%w", err)
	}
	if strings.Contains(msg, "401") || strings.Contains(msg, "Unauthorized") {
		return fmt.Errorf("大模型接口认证失败，请检查 api_key：%w", err)
	}
	if strings.Contains(msg, "502") || strings.Contains(msg, "503") || strings.Contains(msg, "gateway") {
		return fmt.Errorf("大模型网关或服务暂时不可用，请稍后重试：%w", err)
	}
	return fmt.Errorf("大模型调用失败: %w", err)
}
