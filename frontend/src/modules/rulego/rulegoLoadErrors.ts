export type HumanizedLoadFailure = {
  title: string;
  summary: string;
  /** 供技术人员排查的原文，可选弱展示 */
  technicalDetail?: string;
};

function isBindingMissingError(t: string): boolean {
  if (t === "DEVPILOT_RULEGO_BINDING_MISSING") return true;
  if (!t.includes("LoadRuleChainAllowDisabled")) return false;
  return (
    t.includes("not a function") ||
    t.includes("is not a function") ||
    t.includes("undefined") ||
    t.includes("is undefined")
  );
}

/**
 * 将加载规则链时的异常信息转为用户可读的标题与说明；技术细节单独字段便于弱展示。
 */
export function humanizeRuleGoLoadFailure(raw: string): HumanizedLoadFailure {
  const t = String(raw ?? "").trim();

  if (isBindingMissingError(t)) {
    return {
      title: "需要先重新编译应用",
      summary:
        "您当前运行的 DevPilot 里还没有「加载规则链」的最新能力。请完全退出本应用后，在 DevPilot 项目根目录执行一次完整编译并重新启动，例如在终端运行：make dev 或 wails build，然后再打开应用并重试。",
      technicalDetail: t && t !== "DEVPILOT_RULEGO_BINDING_MISSING" ? t : undefined,
    };
  }

  return {
    title: "规则链未能加载到引擎",
    summary:
      "这条规则没有成功进入运行引擎，磁盘上的规则文件也不会被改成「已启用」。请根据下方说明排查：是否缺少节点必填项（例如 GitLab 地址、API 密钥等）、DSL 是否与当前版本支持的节点类型一致。可在「可视化」里修改后保存，再回到本页打开加载开关。",
    technicalDetail: t || undefined,
  };
}
