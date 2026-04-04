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
	"devpilot/backend/internal/store/rulegofile"
	"devpilot/backend/internal/workspace"
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
	routeRewrite  *route_rewrite.Service
	modelManage   *model_management.Service
	ruleGo        *rulego.Service
	skillRepo     *skill_repo.Service
	curlCompare   *curl_compare.Service
	agentService  *agent.Service
	agentWrapper  *AgentServiceWrapper
	workspaceSvc  *workspace.WorkspaceService
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
	rulegoDir, err := rulegofile.DefaultDir()
	if err != nil {
		return nil, err
	}
	if n, mErr := rulegofile.MigrateFromPebbleIfNeeded(context.Background(), db, rulegoDir); mErr != nil {
		log.Printf("[rulego] 从 Pebble 迁移规则链到 %s 失败: %v", rulegoDir, mErr)
	} else if n > 0 {
		log.Printf("[rulego] 已从 Pebble 迁移 %d 条规则链到 %s", n, rulegoDir)
	}
	ruleGoStore, err := rulego.NewFileRuleStore(rulegoDir)
	if err != nil {
		return nil, err
	}
	ruleGoExecLogStore := rulego.NewExecutionLogStore(db)
	ruleGoService := rulego.NewService(ruleGoStore, ruleGoExecLogStore, &ruleGoLLMConfigLister{s: modelService})
	if n, err := ruleGoService.LoadAllEnabledRuleChains(); err != nil {
		log.Printf("[rulego] 启动加载启用规则链: 已加载 %d 条,错误: %v", n, err)
	} else {
		log.Printf("[rulego] 启动加载启用规则链: 共 %d 条", n)
	}

	EnsureSkillsFromInitFS(initSkillsFS, "initSkills")

	// 初始化 Agent 服务：项目根默认为 ~/.devpilot/workData（不存在则创建）；失败时回退到启动 cwd。用户可在聊天页改为任意目录。
	projectRoot, err := agent.DefaultAgentWorkspaceDir()
	if err != nil {
		log.Printf("[agent] 默认工作区 ~/.devpilot/workData 不可用: %v, 回退到启动目录", err)
		projectRoot, err = os.Getwd()
		if err != nil {
			log.Printf("[agent] 获取当前目录失败: %v, 使用 /tmp", err)
			projectRoot = "/tmp"
		}
	}
	agentService, err := agent.NewService(projectRoot)
	if err != nil {
		log.Printf("[agent] 初始化 Agent 服务失败: %v", err)
	} else {
		log.Printf("[agent] Agent 服务已启动, 初始项目路径(可 SetAgentWorkspaceRoot 切换): %s", projectRoot)
	}

	agentWrapper := NewAgentServiceWrapper(agentService)

	// Workspace 服务（多项目工作区）：持久化在 dataDir（~/.devpilot）下的 workspaces.json 与每个 workspaceRoot 的 WORKSPACE.json。
	// 兼容：启动参数 dataDir 变化时，允许从 AgentGlobalDataDir 回退读取（避免“重启后丢失”）
	globalDir, _ := agent.AgentGlobalDataDir()
	wsStore := workspace.NewJSONWorkspaceStoreAtWithFallbacks(dataDir, globalDir)
	wsSvc := workspace.NewWorkspaceService(wsStore, dataDir)
	// 让 rulego 节点解析 workspaceId 时复用同一 resolver，避免重复初始化与路径不一致。
	rulego.SetGlobalWorkspaceRootResolver(wsSvc)

	return &Runtime{
		routeRewrite: routeRewriteService,
		modelManage:  modelService,
		ruleGo:       ruleGoService,
		skillRepo:    skill_repo.NewService(initSkillsFS),
		curlCompare:  curl_compare.NewService(),
		agentService: agentService,
		agentWrapper: agentWrapper,
		workspaceSvc: wsSvc,
		close:        db.Close,
	}, nil
}

func (r *Runtime) RouteRewriteService() *route_rewrite.Service {
	return r.routeRewrite
}

func (r *Runtime) ModelManagementService() *model_management.Service {
	return r.modelManage
}

func (r *Runtime) RuleGoService() *rulego.Service {
	return r.ruleGo
}

func (r *Runtime) SkillRepoService() *skill_repo.Service {
	return r.skillRepo
}

func (r *Runtime) CurlCompareService() *curl_compare.Service {
	return r.curlCompare
}

func (r *Runtime) AgentService() *agent.Service {
	return r.agentService
}

func (r *Runtime) AgentWrapper() *AgentServiceWrapper {
	return r.agentWrapper
}

func (r *Runtime) WorkspaceService() *workspace.WorkspaceService {
	return r.workspaceSvc
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
