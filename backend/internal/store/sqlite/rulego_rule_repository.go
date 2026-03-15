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

const ruleGoRuleColumns = "id, name, description, enabled, definition, editor_json, created_at, updated_at"

func CreateRuleGoRule(ctx context.Context, db *sql.DB, input models.RuleGoRule) (models.RuleGoRule, error) {
	id := uuid.NewString()
	now := time.Now().UTC().Format(time.RFC3339)

	rule := models.RuleGoRule{
		ID:          id,
		Name:        input.Name,
		Description: input.Description,
		Enabled:     input.Enabled,
		Definition:  input.Definition,
		EditorJSON:  input.EditorJSON,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	query := `INSERT INTO rulego_rules (id, name, description, enabled, definition, editor_json, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := db.ExecContext(ctx, query, rule.ID, rule.Name, rule.Description, boolToInt(rule.Enabled), rule.Definition, rule.EditorJSON, rule.CreatedAt, rule.UpdatedAt)
	if err != nil {
		return models.RuleGoRule{}, fmt.Errorf("insert rulego_rules: %w", err)
	}

	return rule, nil
}

func ListRuleGoRules(ctx context.Context, db *sql.DB) ([]models.RuleGoRule, error) {
	query := fmt.Sprintf("SELECT %s FROM rulego_rules ORDER BY updated_at DESC", ruleGoRuleColumns)
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list rulego_rules: %w", err)
	}
	defer rows.Close()

	var result []models.RuleGoRule
	for rows.Next() {
		var rule models.RuleGoRule
		var enabled int
		if err := rows.Scan(&rule.ID, &rule.Name, &rule.Description, &enabled, &rule.Definition, &rule.EditorJSON, &rule.CreatedAt, &rule.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan rulego_rules: %w", err)
		}
		rule.Enabled = enabled != 0
		result = append(result, rule)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows rulego_rules: %w", err)
	}

	return result, nil
}

func UpdateRuleGoRule(ctx context.Context, db *sql.DB, id string, patch models.RuleGoRule) (models.RuleGoRule, error) {
	query := `UPDATE rulego_rules
SET name = ?, description = ?, enabled = ?, definition = ?, editor_json = ?, updated_at = ?
WHERE id = ?`

	res, err := db.ExecContext(ctx, query, patch.Name, patch.Description, boolToInt(patch.Enabled), patch.Definition, patch.EditorJSON, patch.UpdatedAt, id)
	if err != nil {
		return models.RuleGoRule{}, fmt.Errorf("update rulego_rules: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return models.RuleGoRule{}, fmt.Errorf("rows affected: %w", err)
	}
	if rows == 0 {
		return models.RuleGoRule{}, ErrNotFound
	}

	return GetRuleGoRuleByID(ctx, db, id)
}

func DeleteRuleGoRule(ctx context.Context, db *sql.DB, id string) error {
	res, err := db.ExecContext(ctx, `DELETE FROM rulego_rules WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete rulego_rules: %w", err)
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

func GetRuleGoRuleByID(ctx context.Context, db *sql.DB, id string) (models.RuleGoRule, error) {
	query := fmt.Sprintf("SELECT %s FROM rulego_rules WHERE id = ?", ruleGoRuleColumns)
	row := db.QueryRowContext(ctx, query, id)

	var rule models.RuleGoRule
	var enabled int
	if err := row.Scan(&rule.ID, &rule.Name, &rule.Description, &enabled, &rule.Definition, &rule.EditorJSON, &rule.CreatedAt, &rule.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.RuleGoRule{}, ErrNotFound
		}
		return models.RuleGoRule{}, fmt.Errorf("scan rulego_rules: %w", err)
	}
	rule.Enabled = enabled != 0
	return rule, nil
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
