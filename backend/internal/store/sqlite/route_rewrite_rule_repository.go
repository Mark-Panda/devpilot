package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"devpilot/backend/internal/store/sqlite/models"
)

var ErrNotFound = errors.New("record not found")

const routeRewriteColumns = "id, route, method, source_domain, target_domain, created_at, updated_at"

func CreateRouteRewriteRule(ctx context.Context, db *sql.DB, input models.RouteRewriteRule) (models.RouteRewriteRule, error) {
	id := uuid.NewString()
	now := time.Now().UTC().Format(time.RFC3339)

	rule := models.RouteRewriteRule{
		ID:           id,
		Route:        input.Route,
		Method:       input.Method,
		SourceDomain: input.SourceDomain,
		TargetDomain: input.TargetDomain,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	query := `INSERT INTO route_rewrite_rules (id, route, method, source_domain, target_domain, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)`

	_, err := db.ExecContext(ctx, query, rule.ID, rule.Route, rule.Method, rule.SourceDomain, rule.TargetDomain, rule.CreatedAt, rule.UpdatedAt)
	if err != nil {
		return models.RouteRewriteRule{}, fmt.Errorf("insert route_rewrite_rules: %w", err)
	}

	return rule, nil
}

func ListRouteRewriteRules(ctx context.Context, db *sql.DB) ([]models.RouteRewriteRule, error) {
	query := fmt.Sprintf("SELECT %s FROM route_rewrite_rules ORDER BY updated_at DESC", routeRewriteColumns)
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list route_rewrite_rules: %w", err)
	}
	defer rows.Close()

	var result []models.RouteRewriteRule
	for rows.Next() {
		var rule models.RouteRewriteRule
		if err := rows.Scan(&rule.ID, &rule.Route, &rule.Method, &rule.SourceDomain, &rule.TargetDomain, &rule.CreatedAt, &rule.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan route_rewrite_rules: %w", err)
		}
		result = append(result, rule)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows route_rewrite_rules: %w", err)
	}

	return result, nil
}

func UpdateRouteRewriteRule(ctx context.Context, db *sql.DB, id string, patch models.RouteRewriteRule) (models.RouteRewriteRule, error) {
	query := `UPDATE route_rewrite_rules
SET route = ?, method = ?, source_domain = ?, target_domain = ?, updated_at = ?
WHERE id = ?`

	res, err := db.ExecContext(ctx, query, patch.Route, patch.Method, patch.SourceDomain, patch.TargetDomain, patch.UpdatedAt, id)
	if err != nil {
		return models.RouteRewriteRule{}, fmt.Errorf("update route_rewrite_rules: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return models.RouteRewriteRule{}, fmt.Errorf("rows affected: %w", err)
	}
	if rows == 0 {
		return models.RouteRewriteRule{}, ErrNotFound
	}

	return GetRouteRewriteRuleByID(ctx, db, id)
}

func DeleteRouteRewriteRule(ctx context.Context, db *sql.DB, id string) error {
	res, err := db.ExecContext(ctx, `DELETE FROM route_rewrite_rules WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete route_rewrite_rules: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

func GetRouteRewriteRuleByID(ctx context.Context, db *sql.DB, id string) (models.RouteRewriteRule, error) {
	query := fmt.Sprintf("SELECT %s FROM route_rewrite_rules WHERE id = ?", routeRewriteColumns)
	row := db.QueryRowContext(ctx, query, id)

	var rule models.RouteRewriteRule
	if err := row.Scan(&rule.ID, &rule.Route, &rule.Method, &rule.SourceDomain, &rule.TargetDomain, &rule.CreatedAt, &rule.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.RouteRewriteRule{}, ErrNotFound
		}
		return models.RouteRewriteRule{}, fmt.Errorf("scan route_rewrite_rules: %w", err)
	}
	return rule, nil
}
