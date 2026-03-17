package backend

import (
	"log"

	"devpilot/backend/internal/services/model_management"
	"devpilot/backend/internal/services/route_rewrite"
	"devpilot/backend/internal/services/rulego"
	"devpilot/backend/internal/store/pebble"
)

type Runtime struct {
	routeRewrite interface{}
	modelManage  interface{}
	ruleGo       interface{}
	close        func() error
}

func InitRuntime(dataDir string) (*Runtime, error) {
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
	ruleGoService := rulego.NewService(ruleGoStore, ruleGoExecLogStore)
	if n, err := ruleGoService.LoadAllEnabledRuleChains(); err != nil {
		log.Printf("[rulego] 启动加载启用规则链: 已加载 %d 条，错误: %v", n, err)
	} else {
		log.Printf("[rulego] 启动加载启用规则链: 共 %d 条", n)
	}

	return &Runtime{
		routeRewrite: routeRewriteService,
		modelManage:  modelService,
		ruleGo:       ruleGoService,
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

func (r *Runtime) Close() error {
	if r == nil || r.close == nil {
		return nil
	}
	return r.close()
}
