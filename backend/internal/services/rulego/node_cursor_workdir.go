package rulego

import (
	"strings"

	"github.com/rulego/rulego/api/types"
	"github.com/rulego/rulego/components/base"
	"github.com/rulego/rulego/utils/el"
)

// resolveCursorWorkDir 将配置中的 workDir 经 ${...} 模板渲染后再 expandUserPath；
// metadata 中 cursor_acp_cwd 非空时覆盖配置；仍为空则尝试 api_route_tracer_service_path。
// workDirTmpl 由 Init 中 el.NewTemplate(cfg.WorkDir) 得到；nil 时返回空字符串。
func resolveCursorWorkDir(ctx types.RuleContext, msg types.RuleMsg, workDirTmpl el.Template) string {
	if workDirTmpl == nil {
		return ""
	}
	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	cwd := strings.TrimSpace(workDirTmpl.ExecuteAsString(env))
	cwd = expandUserPath(cwd)
	if msg.Metadata != nil {
		if v := strings.TrimSpace(msg.Metadata.GetValue("cursor_acp_cwd")); v != "" {
			cwd = expandUserPath(v)
		}
		if cwd == "" {
			if v := strings.TrimSpace(msg.Metadata.GetValue("api_route_tracer_service_path")); v != "" {
				cwd = expandUserPath(v)
			}
		}
	}
	return cwd
}
