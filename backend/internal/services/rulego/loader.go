package rulego

import (
	"context"
	"errors"
	"log"
	"sort"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/rulego/rulego/engine"

	"devpilot/backend/internal/store/pebble"
)

// GetRegisteredNodeTypes 返回当前 RuleGo 引擎中已注册的节点类型列表（排序后）。
// 用于启动时打印日志或生成 Cursor/Claude 规则文件。
func GetRegisteredNodeTypes() []string {
	components := engine.Registry.GetComponents()
	typeNames := make([]string, 0, len(components))
	for t := range components {
		typeNames = append(typeNames, t)
	}
	sort.Strings(typeNames)
	return typeNames
}

// logRegisteredComponents 打印当前 RuleGo 引擎中已注册的节点类型（启动时调用一次）。
func logRegisteredComponents() {
	typeNames := GetRegisteredNodeTypes()
	if len(typeNames) == 0 {
		log.Printf("[rulego] 已注册节点: (无)")
		return
	}
	for _, t := range typeNames {
		log.Printf("[rulego] 已注册节点: type=%s", t)
	}
	log.Printf("[rulego] 已注册节点共 %d 个", len(typeNames))
}

// LoadRuleChain 将指定规则链从数据库加载到规则引擎池。
// 仅当规则存在、已启用且 definition 非空时加载；若已在池中则 ReloadSelf 更新定义。
func (s *Service) LoadRuleChain(ruleID string) error {
	rule, err := s.store.GetByID(context.Background(), ruleID)
	if err != nil {
		if errors.Is(err, pebble.ErrNotFound) {
			return errors.New("规则不存在")
		}
		return err
	}
	if !rule.Enabled {
		return errors.New("规则已停用，请先启用后再加载")
	}
	if rule.Definition == "" {
		return errors.New("规则定义为空")
	}

	def := []byte(rule.Definition)
	if eng, ok := rulego.Get(ruleID); ok && eng.Initialized() {
		if err := eng.ReloadSelf(def, types.WithAspects(&LogAspect{})); err != nil {
			return err
		}
		log.Printf("[rulego] 规则链已重载: id=%s name=%s", ruleID, rule.Name)
		return nil
	}
	engine, err := rulego.New(ruleID, def, types.WithAspects(&LogAspect{}))
	if err != nil {
		return err
	}
	_ = engine
	log.Printf("[rulego] 规则链已加载: id=%s name=%s", ruleID, rule.Name)
	return nil
}

// UnloadRuleChain 从规则引擎池中卸载指定规则链。
func (s *Service) UnloadRuleChain(ruleID string) error {
	if eng, ok := rulego.Get(ruleID); ok {
		eng.Stop(nil)
	}
	rulego.Del(ruleID)
	log.Printf("[rulego] 规则链已卸载: id=%s", ruleID)
	return nil
}

// LoadAllEnabledRuleChains 加载数据库中所有已启用的规则链到引擎池。
// 系统启动时调用；返回成功加载的数量与首次遇到的错误（若有）。
func (s *Service) LoadAllEnabledRuleChains() (loaded int, err error) {
	logRegisteredComponents()
	rules, err := s.store.List(context.Background())
	if err != nil {
		return 0, err
	}
	for _, rule := range rules {
		if !rule.Enabled || rule.Definition == "" {
			continue
		}
		if _, ok := rulego.Get(rule.ID); ok {
			_ = s.UnloadRuleChain(rule.ID)
		}
		engine, createErr := rulego.New(rule.ID, []byte(rule.Definition), types.WithAspects(&LogAspect{}))
		if createErr != nil {
			log.Printf("[rulego] 启动加载规则链失败 id=%s name=%s: %v", rule.ID, rule.Name, createErr)
			if err == nil {
				err = createErr
			}
			continue
		}
		_ = engine
		loaded++
	}
	log.Printf("[rulego] 启动加载完成: 已加载 %d 条启用规则链", loaded)
	return loaded, err
}
