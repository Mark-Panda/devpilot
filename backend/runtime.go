package backend

import (
	"fmt"

	"devpilot/backend/internal/services/model_management"
	"devpilot/backend/internal/services/route_rewrite"
	"devpilot/backend/internal/store/sqlite"
)

type Runtime struct {
	routeRewrite interface{}
	modelManage  interface{}
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

	return &Runtime{
		routeRewrite: routeRewriteService,
		modelManage:  modelService,
		close:        db.Close,
	}, nil
}

func (r *Runtime) RouteRewriteService() interface{} {
	return r.routeRewrite
}

func (r *Runtime) ModelManagementService() interface{} {
	return r.modelManage
}

func (r *Runtime) Close() error {
	if r == nil || r.close == nil {
		return nil
	}
	return r.close()
}
