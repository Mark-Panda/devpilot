package agent

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// memoryMessageBus 基于内存的消息总线实现
type memoryMessageBus struct {
	mu          sync.RWMutex
	subscribers map[string]chan Message
	bufferSize  int
}

// NewMessageBus 创建消息总线
func NewMessageBus(bufferSize int) MessageBus {
	if bufferSize <= 0 {
		bufferSize = 100
	}
	return &memoryMessageBus{
		subscribers: make(map[string]chan Message),
		bufferSize:  bufferSize,
	}
}

// Subscribe 订阅消息
func (b *memoryMessageBus) Subscribe(agentID string) (<-chan Message, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if _, exists := b.subscribers[agentID]; exists {
		return nil, fmt.Errorf("agent %s already subscribed", agentID)
	}

	ch := make(chan Message, b.bufferSize)
	b.subscribers[agentID] = ch

	log.Info().Str("agent_id", agentID).Msg("agent subscribed to message bus")
	return ch, nil
}

// Unsubscribe 取消订阅
func (b *memoryMessageBus) Unsubscribe(agentID string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	ch, exists := b.subscribers[agentID]
	if !exists {
		return fmt.Errorf("agent %s not subscribed", agentID)
	}

	close(ch)
	delete(b.subscribers, agentID)

	log.Info().Str("agent_id", agentID).Msg("agent unsubscribed from message bus")
	return nil
}

// Publish 发布广播消息
func (b *memoryMessageBus) Publish(ctx context.Context, msg Message) error {
	b.mu.RLock()
	defer b.mu.RUnlock()

	msg.Timestamp = time.Now()
	if msg.ID == "" {
		msg.ID = generateMessageID()
	}

	count := 0
	for agentID, ch := range b.subscribers {
		// 跳过发送者自己
		if agentID == msg.FromAgent {
			continue
		}
		select {
		case ch <- msg:
			count++
		case <-ctx.Done():
			return ctx.Err()
		default:
			log.Warn().Str("agent_id", agentID).Msg("message bus channel full, message dropped")
		}
	}

	log.Debug().
		Str("from", msg.FromAgent).
		Str("type", string(msg.Type)).
		Int("receivers", count).
		Msg("message published")
	return nil
}

// PublishToAgent 发送消息给指定代理
func (b *memoryMessageBus) PublishToAgent(ctx context.Context, msg Message, targetAgentID string) error {
	b.mu.RLock()
	defer b.mu.RUnlock()

	msg.Timestamp = time.Now()
	if msg.ID == "" {
		msg.ID = generateMessageID()
	}
	msg.ToAgent = targetAgentID

	ch, exists := b.subscribers[targetAgentID]
	if !exists {
		return fmt.Errorf("agent %s not found", targetAgentID)
	}

	select {
	case ch <- msg:
		log.Debug().
			Str("from", msg.FromAgent).
			Str("to", targetAgentID).
			Str("type", string(msg.Type)).
			Msg("message sent to agent")
		return nil
	case <-ctx.Done():
		return ctx.Err()
	default:
		return fmt.Errorf("agent %s message channel full", targetAgentID)
	}
}

// generateMessageID 生成消息 ID
func generateMessageID() string {
	return fmt.Sprintf("msg_%d", time.Now().UnixNano())
}
