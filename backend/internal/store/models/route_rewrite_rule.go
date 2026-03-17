package models

type RouteRewriteRule struct {
	ID           string `db:"id" json:"id"`
	Route        string `db:"route" json:"route"`
	Method       string `db:"method" json:"method"`
	SourceDomain string `db:"source_domain" json:"source_domain"`
	TargetDomain string `db:"target_domain" json:"target_domain"`
	CreatedAt    string `db:"created_at" json:"created_at"`
	UpdatedAt    string `db:"updated_at" json:"updated_at"`
}
