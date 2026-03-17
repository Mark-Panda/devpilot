package llm

import "errors"

var (
	ErrInvalidConfig      = errors.New("llm: invalid config (base_url, api_key and model are required)")
	ErrEmptyResponse      = errors.New("llm: empty response from model")
	ErrToolLoopMaxRounds  = errors.New("llm: tool loop exceeded max rounds")
	ErrSkillNotFound      = errors.New("llm: skill not found for execution")
)
