package rulego

import (
	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/rulego/rulego/components/action"
)

// execNodeWhitelistCSV 为 RuleGo 内置 exec 节点允许的可执行名（仅匹配 configuration.cmd，不含 PATH 解析）。
// 复杂命令请使用 cmd=sh、args=["-c","..."]；此时仅需 sh 在白名单中。
const execNodeWhitelistCSV = "sh,bash,zsh,/bin/sh,/bin/bash,cursor,code,git,open,ls,cat,echo,which,env,python3,python,node,npm,pnpm,yarn,go,mv,cp,rm,mkdir,rmdir,touch,chmod,find,grep,sed,awk,curl,wget"

// ruleEngineOpts 返回创建/重载规则引擎时的共用选项：默认 Config（含 exec 白名单）与可选切面。
func ruleEngineOpts(aspects ...types.Aspect) []types.RuleEngineOption {
	cfg := rulego.NewConfig()
	cfg.Properties.PutValue(action.KeyExecNodeWhitelist, execNodeWhitelistCSV)
	opts := []types.RuleEngineOption{types.WithConfig(cfg)}
	if len(aspects) > 0 {
		opts = append(opts, types.WithAspects(aspects...))
	}
	return opts
}
