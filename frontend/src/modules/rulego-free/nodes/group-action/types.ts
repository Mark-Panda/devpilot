export interface GroupActionConfig {
  nodeIds: string[];
  matchRelationType: 'Success' | 'Failure';
  matchNum: number;
  timeout: number;
  mergeToMap: boolean;
}
