import { workspace } from "../../../wailsjs/go/models";
import * as WorkspaceService from "../../../wailsjs/go/workspace/WorkspaceService";

export type WorkspaceSummary = workspace.Workspace;
export type WorkspaceDetail = workspace.Workspace;
export type WorkspaceValidationReport = workspace.ValidationReport;

export const workspaceApi = {
  createWorkspace: async (name: string): Promise<workspace.Workspace> => {
    return await WorkspaceService.CreateWorkspace(name);
  },

  listWorkspaces: async (): Promise<workspace.Workspace[]> => {
    return await WorkspaceService.ListWorkspaces();
  },

  getWorkspace: async (id: string): Promise<workspace.Workspace> => {
    return await WorkspaceService.GetWorkspace(id);
  },

  addProject: async (
    workspaceId: string,
    projectAbsPath: string,
    name?: string
  ): Promise<workspace.Workspace> => {
    return await WorkspaceService.AddProject(workspaceId, projectAbsPath, name ?? "");
  },

  removeProject: async (workspaceId: string, projectId: string): Promise<workspace.Workspace> => {
    return await WorkspaceService.RemoveProject(workspaceId, projectId);
  },

  validateWorkspace: async (workspaceId: string): Promise<workspace.ValidationReport> => {
    return await WorkspaceService.ValidateWorkspace(workspaceId);
  },
};

