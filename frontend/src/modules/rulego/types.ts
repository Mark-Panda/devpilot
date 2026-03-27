export type RuleGoRule = {
  id: string;
  name: string;
  description: string;
  definition: string;
  editorJson: string;
  /** 规则链请求元数据参数表 JSON 数组字符串 */
  requestMetadataParamsJson?: string;
  /** 规则链请求消息体参数表 JSON 数组字符串 */
  requestMessageBodyParamsJson?: string;
  /** 关联技能目录名（~/.devpilot/skills/{skillDirName}），有值表示已生成技能 */
  skillDirName?: string;
};
