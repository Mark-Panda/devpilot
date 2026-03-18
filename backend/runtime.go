package backend

import (
	"context"
	"io/fs"
	"log"

	"devpilot/backend/internal/services/curl_compare"
	"devpilot/backend/internal/services/model_management"
	"devpilot/backend/internal/services/route_rewrite"
	"devpilot/backend/internal/services/rulego"
	"devpilot/backend/internal/services/skill_repo"
	"devpilot/backend/internal/store/pebble"
)

// ruleGoLLMConfigLister 将模型管理列表转为 rulego.LLMConfigLister，供规则链执行时用模型管理中的 API Key 覆盖 ai/llm 节点。
type ruleGoLLMConfigLister struct {
	s *model_management.Service
}

func (r *ruleGoLLMConfigLister) ListLLMConfigs(ctx context.Context) ([]rulego.LLMConfigEntry, error) {
	list, err := r.s.ListModelConfigs()
	if err != nil {
		return nil, err
	}
	out := make([]rulego.LLMConfigEntry, 0, len(list))
	for _, c := range list {
		out = append(out, rulego.LLMConfigEntry{BaseURL: c.BaseURL, APIKey: c.APIKey, Models: c.Models})
	}
	return out, nil
}

type Runtime struct {
	routeRewrite  interface{}
	modelManage   interface{}
	ruleGo        interface{}
	skillRepo     interface{}
	curlCompare   interface{}
	close         func() error
}

// InitRuntime 初始化运行时。initSkillsFS 为嵌入的 initSkills 文件系统，用于启动时及列举技能时同步到 ~/.devpilot/skills/，可为 nil。
func InitRuntime(dataDir string, initSkillsFS fs.FS) (*Runtime, error) {
	db, err := pebble.Open(dataDir)
	if err != nil {
		return nil, err
	}

	routeRewriteStore := route_rewrite.NewStore(db)
	routeRewriteService := route_rewrite.NewService(routeRewriteStore)
	modelStore := model_management.NewStore(db)
	modelService := model_management.NewService(modelStore)
	ruleGoStore := rulego.NewStore(db)
	ruleGoExecLogStore := rulego.NewExecutionLogStore(db)
	ruleGoService := rulego.NewService(ruleGoStore, ruleGoExecLogStore, &ruleGoLLMConfigLister{s: modelService})
	if n, err := ruleGoService.LoadAllEnabledRuleChains(); err != nil {
		log.Printf("[rulego] 启动加载启用规则链: 已加载 %d 条，错误: %v", n, err)
	} else {
		log.Printf("[rulego] 启动加载启用规则链: 共 %d 条", n)
	}

	EnsureSkillsFromInitFS(initSkillsFS, "initSkills")

	return &Runtime{
		routeRewrite: routeRewriteService,
		modelManage:  modelService,
		ruleGo:       ruleGoService,
		skillRepo:    skill_repo.NewService(initSkillsFS),
		curlCompare:  curl_compare.NewService(),
		close:        db.Close,
	}, nil
}

func (r *Runtime) RouteRewriteService() interface{} {
	return r.routeRewrite
}

func (r *Runtime) ModelManagementService() interface{} {
	return r.modelManage
}

func (r *Runtime) RuleGoService() interface{} {
	return r.ruleGo
}

func (r *Runtime) SkillRepoService() interface{} {
	return r.skillRepo
}

func (r *Runtime) CurlCompareService() interface{} {
	return r.curlCompare
}

func (r *Runtime) Close() error {
	if r == nil || r.close == nil {
		return nil
	}
	return r.close()
}
