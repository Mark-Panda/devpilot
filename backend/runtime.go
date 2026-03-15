package backend

import (
	"fmt"

	"devpilot/backend/internal/services/route_rewrite"
	"devpilot/backend/internal/store/sqlite"
)

type Runtime struct {
	routeRewrite interface{}
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

	store := route_rewrite.NewStore(db.DB)
	service := route_rewrite.NewService(store)

	return &Runtime{
		routeRewrite: service,
		close:        db.Close,
	}, nil
}

func (r *Runtime) RouteRewriteService() interface{} {
	return r.routeRewrite
}

func (r *Runtime) Close() error {
	if r == nil || r.close == nil {
		return nil
	}
	return r.close()
}
