package backend

import (
	"context"
	"io/fs"
	"log"
	"os"

	"devpilot/backend/internal/agent"
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
	agentService  *agent.Service
	agentWrapper  *AgentServiceWrapper
	close         func() error
}

// InitRuntime 初始化运行时。initSkillsFS 为嵌入的 initSkills 文件系统,用于启动时及列举技能时同步到 ~/.devpilot/skills/,可为 nil。
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
		log.Printf("[rulego] 启动加载启用规则链: 已加载 %d 条,错误: %v", n, err)
	} else {
		log.Printf("[rulego] 启动加载启用规则链: 共 %d 条", n)
	}

	EnsureSkillsFromInitFS(initSkillsFS, "initSkills")

	// 初始化 Agent 服务 (使用当前工作目录作为项目路径)
	cwd, err := os.Getwd()
	if err != nil {
		log.Printf("[agent] 获取当前目录失败: %v, 使用 /tmp", err)
		cwd = "/tmp"
	}
	agentService, err := agent.NewService(cwd)
	if err != nil {
		log.Printf("[agent] 初始化 Agent 服务失败: %v", err)
	} else {
		log.Printf("[agent] Agent 服务已启动, 项目路径: %s", cwd)
	}

	agentWrapper := NewAgentServiceWrapper(agentService)

	return &Runtime{
		routeRewrite: routeRewriteService,
		modelManage:  modelService,
		ruleGo:       ruleGoService,
		skillRepo:    skill_repo.NewService(initSkillsFS),
		curlCompare:  curl_compare.NewService(),
		agentService: agentService,
		agentWrapper: agentWrapper,
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

func (r *Runtime) AgentService() *agent.Service {
	return r.agentService
}

func (r *Runtime) AgentWrapper() *AgentServiceWrapper {
	return r.agentWrapper
}

func (r *Runtime) Close() error {
	if r == nil || r.close == nil {
		return nil
	}
	if r.agentService != nil {
		if err := r.agentService.Shutdown(); err != nil {
			log.Printf("[agent] shutdown error: %v", err)
		}
	}
	return r.close()
}
