import { useState, useEffect, useCallback } from "react";
import {
  listSkillPackages,
  uploadSkillZip,
  uploadSkillZipFromFile,
  getSkillPackageDetail,
  getSkillPackageFileContent,
  type SkillPackageItem,
  type SkillPackageDetail,
} from "./useSkillRepoApi";

export default function SkillRepoPage() {
  const [packages, setPackages] = useState<SkillPackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SkillPackageDetail | null>(null);
  const [detailDirName, setDetailDirName] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fileContent, setFileContent] = useState<{ filePath: string; content: string } | null>(null);
  const [fileContentLoading, setFileContentLoading] = useState(false);
  const [fileContentError, setFileContentError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSkillPackages();
      setPackages(list ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async () => {
    setUploading(true);
    setError(null);
    try {
      const done = await uploadSkillZip();
      if (done) {
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (!file || !file.name.toLowerCase().endsWith(".zip")) {
        setError("请拖放 .zip 文件");
        return;
      }
      setUploading(true);
      setError(null);
      try {
        await uploadSkillZipFromFile(file);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setUploading(false);
      }
    },
    [load]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleViewDetail = useCallback(async (dirName: string) => {
    setDetail(null);
    setDetailDirName(null);
    setFileContent(null);
    setFileContentError(null);
    setDetailLoading(true);
    try {
      const d = await getSkillPackageDetail(dirName);
      setDetail(d);
      setDetailDirName(dirName);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleViewFile = useCallback(
    async (filePath: string) => {
      if (!detailDirName) return;
      setFileContent(null);
      setFileContentError(null);
      setFileContentLoading(true);
      try {
        const content = await getSkillPackageFileContent(detailDirName, filePath);
        setFileContent({ filePath, content });
      } catch (e) {
        setFileContentError(e instanceof Error ? e.message : String(e));
      } finally {
        setFileContentLoading(false);
      }
    },
    [detailDirName]
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>技能仓库</h2>
          <p className="page-subtitle">
            管理 ~/.devpilot/skills/ 下的技能包，可上传 zip 或拖放到下方工作区
          </p>
        </div>
        <div className="page-actions">
          <button
            className="primary-button"
            type="button"
            disabled={uploading}
            onClick={handleUpload}
          >
            {uploading ? "处理中…" : "上传技能包"}
          </button>
          <button className="text-button" type="button" onClick={load} disabled={loading}>
            刷新
          </button>
        </div>
      </div>

      <div
        className={`skill-repo-dropzone${dragOver ? " is-dragover" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <p className="skill-repo-dropzone-text">
          {dragOver ? "松开以上传" : "将技能包 .zip 拖放到此处上传"}
        </p>
      </div>

      <div className="table-card skill-repo-table">
        <div className="table-head">
          <div className="table-cell">目录名</div>
          <div className="table-cell">技能名</div>
          <div className="table-cell">操作</div>
        </div>
        {loading ? (
          <div className="table-empty">加载中...</div>
        ) : packages.length === 0 ? (
          <div className="table-empty">暂无技能包，请上传 zip 或在此目录下放置含 SKILL.md 的子目录</div>
        ) : (
          <div className="table-body">
            {packages.map((pkg) => (
              <div className="table-row" key={pkg.dir_name}>
                <div className="table-cell">{pkg.dir_name}</div>
                <div className="table-cell">{pkg.name || "—"}</div>
                <div className="table-cell table-actions">
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => handleViewDetail(pkg.dir_name)}
                    disabled={detailLoading}
                  >
                    查看
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {error ? <div className="table-error">{error}</div> : null}
      </div>

      {detail ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => { setDetail(null); setDetailDirName(null); setFileContent(null); }}
        >
          <div className="modal skill-repo-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>目录详情</h3>
              <button
                className="text-button"
                type="button"
                onClick={() => { setDetail(null); setDetailDirName(null); setFileContent(null); }}
              >
                关闭
              </button>
            </div>
            <div className="skill-repo-detail-body">
              <p className="skill-repo-detail-path">
                <span className="skill-repo-detail-label">路径：</span>
                <code>{detail.dir_path}</code>
              </p>
              <p className="skill-repo-detail-label">文件列表（{detail.files?.length ?? 0} 项），点击文件名查看内容：</p>
              <ul className="skill-repo-detail-files">
                {(detail.files ?? []).sort().map((f) => {
                  const isDir = f.endsWith("/") || f.endsWith("\\");
                  return (
                    <li key={f}>
                      {isDir ? (
                        <code>{f}</code>
                      ) : (
                        <button
                          type="button"
                          className="skill-repo-file-link"
                          onClick={() => handleViewFile(f)}
                          disabled={fileContentLoading}
                        >
                          <code>{f}</code>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {fileContentLoading ? (
                <p className="skill-repo-detail-loading">加载文件内容中…</p>
              ) : null}
              {fileContentError ? (
                <p className="skill-repo-detail-error">{fileContentError}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {fileContent ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setFileContent(null)}
        >
          <div
            className="modal skill-repo-file-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>文件详情</h3>
              <button className="text-button" type="button" onClick={() => setFileContent(null)}>
                关闭
              </button>
            </div>
            <div className="skill-repo-file-body">
              <p className="skill-repo-detail-path">
                <span className="skill-repo-detail-label">文件：</span>
                <code>{fileContent.filePath}</code>
              </p>
              <pre className="skill-repo-file-content">{fileContent.content}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
