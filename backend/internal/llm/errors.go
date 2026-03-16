package llm

import "errors"

var (
	ErrInvalidConfig  = errors.New("llm: invalid config (base_url, api_key and model are required)")
	ErrEmptyResponse  = errors.New("llm: empty response from model")
)
