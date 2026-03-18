import {
  DeleteSkillPackage as DeleteSkillPackageApi,
  ExtractSkillZip,
  ExtractSkillZipFromData,
  GetSkillPackageDetail,
  GetSkillPackageFileContent,
  ListSkillPackages,
} from "../../../wailsjs/go/skill_repo/Service";
import { OpenSkillZipDialog } from "../../../wailsjs/go/main/App";
import type { skill_repo } from "../../../wailsjs/go/models";

export type SkillPackageItem = skill_repo.SkillPackageItem;
export type SkillPackageDetail = skill_repo.SkillPackageDetail;

export async function listSkillPackages(): Promise<SkillPackageItem[]> {
  return ListSkillPackages();
}

/** 获取技能包目录详情：绝对路径与文件相对路径列表 */
export async function getSkillPackageDetail(dirName: string): Promise<SkillPackageDetail> {
  return GetSkillPackageDetail(dirName);
}

/** 获取技能包内指定文件的文本内容（仅 UTF-8 文本，二进制返回错误） */
export async function getSkillPackageFileContent(
  dirName: string,
  relativePath: string
): Promise<string> {
  const fn = window["go"]?.["skill_repo"]?.["Service"]?.["GetSkillPackageFileContent"];
  if (typeof fn !== "function") {
    throw new Error(
      "当前应用版本不支持查看文件内容，请重新编译并运行应用（make build 或 wails dev）后再试。"
    );
  }
  return GetSkillPackageFileContent(dirName, relativePath);
}

/** 打开文件对话框选择 zip，解压到 ~/.devpilot/skills/。返回 true 表示已成功解压并可刷新列表，false 表示用户取消。 */
export async function uploadSkillZip(): Promise<boolean> {
  const path = await OpenSkillZipDialog();
  if (!path || path.trim() === "") {
    return false;
  }
  await ExtractSkillZip(path);
  return true;
}

/** 将 File 转为 base64 字符串 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result as string;
      const base64 = dataUrl.indexOf(",") >= 0 ? dataUrl.split(",")[1] : dataUrl;
      resolve(base64 ?? "");
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** 使用 zip 文件内容（如拖放得到的 File）解压到 ~/.devpilot/skills/ */
export async function uploadSkillZipFromFile(file: File): Promise<void> {
  const base64 = await fileToBase64(file);
  await ExtractSkillZipFromData(base64);
}

/** 删除指定技能包目录。initSkills 内置技能与规则链生成的技能会报错。 */
export async function deleteSkillPackage(dirName: string): Promise<void> {
  return DeleteSkillPackageApi(dirName);
}
