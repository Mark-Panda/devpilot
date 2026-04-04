/** 侧栏「规则管理」或编辑器返回列表时传入 NavLink/navigate 的 state，RuleGoPage 据此静默刷新（含 engine_loaded） */
export const rulegoListLinkState = { rulegoListRefresh: true as const };

export type RuleGoListLocationState = { rulegoListRefresh?: boolean };
