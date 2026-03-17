export type RuleGoRule = {
  id: string;
  name: string;
  description: string;
  definition: string;
  editorJson: string;
  /** 关联技能目录名（~/.devpilot/skills/{skillDirName}），有值表示已生成技能 */
  skillDirName?: string;
};
