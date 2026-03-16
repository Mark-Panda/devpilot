package backend

import (
	"fmt"
	"log"

	"devpilot/backend/internal/services/model_management"
	"devpilot/backend/internal/services/route_rewrite"
	"devpilot/backend/internal/services/rulego"
	"devpilot/backend/internal/store/sqlite"
)

type Runtime struct {
	routeRewrite interface{}
	modelManage  interface{}
	ruleGo       interface{}
	close        func() error
}

func InitRuntime(dbPath string) (*Runtime, error) {
	db, err := sqlite.Open(dbPath)
	if err != nil {
		return nil, err
	}

	if err := sqlite.Migrate(db.DB); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("migrate db: %w", err)
	}

	routeRewriteStore := route_rewrite.NewStore(db.DB)
	routeRewriteService := route_rewrite.NewService(routeRewriteStore)
	modelStore := model_management.NewStore(db.DB)
	modelService := model_management.NewService(modelStore)
	ruleGoStore := rulego.NewStore(db.DB)
	ruleGoExecLogStore := rulego.NewExecutionLogStore(db.DB)
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
