package agent

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/rs/zerolog/log"
)

// NormalizeAgentWorkspaceRoot 校验并规范 workspace_root：空串表示使用应用默认项目根；非空须为已存在目录，返回绝对路径。
func NormalizeAgentWorkspaceRoot(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", nil
	}
	abs, err := filepath.Abs(s)
	if err != nil {
		return "", fmt.Errorf("workspace_root: %w", err)
	}
	fi, err := os.Stat(abs)
	if err != nil {
		return "", fmt.Errorf("workspace_root 不可用: %w", err)
	}
	if !fi.IsDir() {
		return "", fmt.Errorf("workspace_root 须为目录: %s", abs)
	}
	if sym, err := filepath.EvalSymlinks(abs); err == nil {
		return sym, nil
	}
	return abs, nil
}

// resolveWorkspacePathIfDir 若 p 为已存在目录则返回规范绝对路径，否则空串
func resolveWorkspacePathIfDir(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return ""
	}
	fi, err := os.Stat(abs)
	if err != nil || !fi.IsDir() {
		return ""
	}
	if sym, err := filepath.EvalSymlinks(abs); err == nil {
		return sym
	}
	return abs
}

// effectiveFileWorkspaceRootGlobal Agent 全局 workspace_root，否则应用默认工作区根（~/.devpilot/workData 或 Relocate 后的路径）
func (a *agentImpl) effectiveFileWorkspaceRootGlobal() string {
	a.mu.RLock()
	ws := strings.TrimSpace(a.config.WorkspaceRoot)
	a.mu.RUnlock()
	if ws != "" {
		if got := resolveWorkspacePathIfDir(ws); got != "" {
			return got
		}
		log.Warn().Str("agent_id", a.config.ID).Str("workspace_root", ws).Msg("agent workspace_root 无效，回退到应用默认工作区根")
	}
	if a.projectCtx != nil {
		return strings.TrimSpace(a.projectCtx.RootPath())
	}
	return ""
}

// effectiveFileWorkspaceRoot 会话内文件工具与 MCP 根路径：工作室显式覆盖 > 分区下 agents/<id>/workData > Agent workspace_root > 应用默认工作区根
func (a *agentImpl) effectiveFileWorkspaceRoot(ctx context.Context) string {
	sid := strings.TrimSpace(StudioIDFromContext(ctx))
	if sid != "" && a.studioAgentWorkspace != nil {
		stored := strings.TrimSpace(a.studioAgentWorkspace.StudioAgentWorkspaceGet(sid, a.config.ID))
		if stored != "" {
			if got := resolveWorkspacePathIfDir(stored); got != "" {
				return got
			}
			log.Warn().
				Str("agent_id", a.config.ID).
				Str("studio_id", sid).
				Str("path", stored).
				Msg("工作室成员工作区路径无效，回退到分区 workData 或 Agent/应用默认")
		}
		wd, werr := StudioAgentWorkDataDir(sid, a.config.ID)
		if werr == nil && wd != "" {
			return wd
		}
		if werr != nil {
			log.Warn().Err(werr).Str("agent_id", a.config.ID).Str("studio_id", sid).Msg("studio default workData unavailable")
		}
	}
	return a.effectiveFileWorkspaceRootGlobal()
}

func (a *agentImpl) hasAgentFileWorkspaceTools(ctx context.Context) bool {
	return strings.TrimSpace(a.effectiveFileWorkspaceRoot(ctx)) != ""
}
