import { useMemo, useState } from "react";
import { runCompareCurl } from "./useCurlCompareApi";
import type { CompareCurlOutput } from "./useCurlCompareApi";
import type { curl_compare } from "../../../wailsjs/go/models";

type JSONDiffItem = curl_compare.JSONDiffItem;

function DiffKindBadge({ kind }: { kind: string }) {
  const label =
    kind === "missing"
      ? "目标缺失"
      : kind === "type_diff"
        ? "类型不同"
        : "值不同";
  const cls =
    kind === "missing"
      ? "curl-compare-diff-badge missing"
      : kind === "type_diff"
        ? "curl-compare-diff-badge type-diff"
        : "curl-compare-diff-badge different";
  return <span className={cls}>{label}</span>;
}

function DiffRow({ d }: { d: JSONDiffItem }) {
  const [expand, setExpand] = useState(false);
  const hasJson = d.source_json || d.target_json;
  return (
    <div className="curl-compare-diff-row">
      <div className="curl-compare-diff-head">
        <code className="curl-compare-diff-path">{d.path}</code>
        <DiffKindBadge kind={d.kind} />
      </div>
      <div className="curl-compare-diff-values">
        <div className="curl-compare-diff-side">
          <span className="curl-compare-diff-label">来源</span>
          <span className="curl-compare-diff-val">{d.source_val || "—"}</span>
        </div>
        <div className="curl-compare-diff-side">
          <span className="curl-compare-diff-label">目标</span>
          <span className="curl-compare-diff-val">{d.target_val || "—"}</span>
        </div>
      </div>
      {hasJson && (
        <>
          <button
            type="button"
            className="curl-compare-diff-toggle"
            onClick={() => setExpand((e) => !e)}
          >
            {expand ? "收起 JSON" : "展开 JSON"}
          </button>
          {expand && (
            <div className="curl-compare-diff-json">
              {d.source_json && (
                <div>
                  <span className="curl-compare-diff-label">来源 JSON</span>
                  <pre>{d.source_json}</pre>
                </div>
              )}
              {d.target_json && (
                <div>
                  <span className="curl-compare-diff-label">目标 JSON</span>
                  <pre>{d.target_json}</pre>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResultView({ result }: { result: CompareCurlOutput }) {
  const [logExpanded, setLogExpanded] = useState(false);
  const hasError =
    result.parse_curl_error ||
    result.source_body_err ||
    result.target_body_err;
  const okSource = !result.source_body_err && result.source_status >= 200 && result.source_status < 300;
  const okTarget = !result.target_body_err && result.target_status >= 200 && result.target_status < 300;
  const hasRequestLog =
    result.source_request_url ||
    result.target_request_url ||
    result.request_method;
  const hasDiffs = result.diffs && result.diffs.length > 0;
  const noDiffYet = !hasError && result.diff_count === 0 && result.source_status !== 0;

  return (
    <div className="curl-compare-result">
      {/* 顶部错误：解析错误或请求错误 */}
      {result.parse_curl_error && (
        <div className="curl-compare-parse-err">
          curl 解析错误: {result.parse_curl_error}
        </div>
      )}
      {hasError && !result.parse_curl_error && (
        <p className="curl-compare-hint">
          请检查来源 URL、目标 URL 是否可访问，以及 curl 命令格式是否正确。
        </p>
      )}

      {/* 一行状态摘要：不抢差异的视线 */}
      <div className="curl-compare-status-inline">
        <span className="curl-compare-status-inline-item">
          来源 <strong className={okSource ? "ok" : "err"}>{result.source_status || "—"}</strong>
          {result.source_body_err && <span className="err-msg"> {result.source_body_err}</span>}
        </span>
        <span className="curl-compare-status-inline-sep">·</span>
        <span className="curl-compare-status-inline-item">
          目标 <strong className={okTarget ? "ok" : "err"}>{result.target_status || "—"}</strong>
          {result.target_body_err && <span className="err-msg"> {result.target_body_err}</span>}
        </span>
      </div>

      {/* 核心：数据差异对比 — 置顶且视觉最重 */}
      <section className="curl-compare-diff-section" aria-label="数据差异对比">
        <h3 className="curl-compare-diff-section-title">
          {hasDiffs ? (
            <>数据差异 <span className="curl-compare-diff-count">{result.diff_count}</span> 处</>
          ) : (
            "数据差异"
          )}
        </h3>
        {hasDiffs && (
          <p className="curl-compare-diff-section-desc">
            以来源 JSON 为基准，对比目标中是否存在且一致
          </p>
        )}
        {hasDiffs && (
          <div className="curl-compare-diff-list">
            {result.diffs!.map((d, i) => (
              <DiffRow key={`${d.path}-${i}`} d={d} />
            ))}
          </div>
        )}
        {noDiffYet && (
          <p className="curl-compare-no-diff">两份 JSON 结果一致，无差异。</p>
        )}
        {hasError && !hasDiffs && !noDiffYet && (
          <p className="curl-compare-diff-placeholder">请求异常或响应非 JSON，无法对比。</p>
        )}
      </section>

      {/* 请求与响应日志：可折叠，默认收起 */}
      {hasRequestLog && (
        <div className="curl-compare-request-log-wrap">
          <button
            type="button"
            className="curl-compare-log-toggle"
            onClick={() => setLogExpanded((e) => !e)}
            aria-expanded={logExpanded}
          >
            {logExpanded ? "收起" : "查看"}请求与响应日志
          </button>
          {logExpanded && (
            <div className="curl-compare-request-log">
              <div className="curl-compare-log-grid">
                <div className="curl-compare-log-block">
                  <div className="curl-compare-log-head">请求参数（共用）</div>
                  <div className="curl-compare-log-body">
                    {result.request_method && (
                      <div className="curl-compare-log-line">
                        <span className="curl-compare-log-key">Method</span>{" "}
                        {result.request_method}
                      </div>
                    )}
                    {result.request_headers && (
                      <div className="curl-compare-log-line">
                        <span className="curl-compare-log-key">Headers</span>
                        <pre className="curl-compare-log-pre">{result.request_headers}</pre>
                      </div>
                    )}
                    {result.request_body !== undefined && result.request_body !== "" && (
                      <div className="curl-compare-log-line">
                        <span className="curl-compare-log-key">Body</span>
                        <pre className="curl-compare-log-pre">{result.request_body || "(空)"}</pre>
                      </div>
                    )}
                    {!result.request_method && !result.request_headers && (result.request_body === undefined || result.request_body === "") && (
                      <div className="curl-compare-log-line">—</div>
                    )}
                  </div>
                </div>
                <div className="curl-compare-log-block">
                  <div className="curl-compare-log-head">来源请求</div>
                  <div className="curl-compare-log-body">
                    <div className="curl-compare-log-line">
                      <span className="curl-compare-log-key">URL</span>
                      <pre className="curl-compare-log-pre curl-compare-log-url">{result.source_request_url || "—"}</pre>
                    </div>
                  </div>
                </div>
                <div className="curl-compare-log-block">
                  <div className="curl-compare-log-head">来源响应</div>
                  <div className="curl-compare-log-body">
                    <div className="curl-compare-log-line">
                      <span className="curl-compare-log-key">Status</span> {result.source_status ?? "—"}
                    </div>
                    {result.source_response_preview !== undefined && result.source_response_preview !== "" && (
                      <div className="curl-compare-log-line">
                        <span className="curl-compare-log-key">Body</span>
                        <pre className="curl-compare-log-pre curl-compare-log-response">{result.source_response_preview}</pre>
                      </div>
                    )}
                  </div>
                </div>
                <div className="curl-compare-log-block">
                  <div className="curl-compare-log-head">目标请求</div>
                  <div className="curl-compare-log-body">
                    <div className="curl-compare-log-line">
                      <span className="curl-compare-log-key">URL</span>
                      <pre className="curl-compare-log-pre curl-compare-log-url">{result.target_request_url || "—"}</pre>
                    </div>
                  </div>
                </div>
                <div className="curl-compare-log-block">
                  <div className="curl-compare-log-head">目标响应</div>
                  <div className="curl-compare-log-body">
                    <div className="curl-compare-log-line">
                      <span className="curl-compare-log-key">Status</span> {result.target_status ?? "—"}
                    </div>
                    {result.target_response_preview !== undefined && result.target_response_preview !== "" && (
                      <div className="curl-compare-log-line">
                        <span className="curl-compare-log-key">Body</span>
                        <pre className="curl-compare-log-pre curl-compare-log-response">{result.target_response_preview}</pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CurlComparePage() {
  const [sourceURL, setSourceURL] = useState("");
  const [targetURL, setTargetURL] = useState("");
  const [curlRaw, setCurlRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareCurlOutput | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      sourceURL.trim() !== "" &&
      targetURL.trim() !== "" &&
      curlRaw.trim() !== ""
    );
  }, [sourceURL, targetURL, curlRaw]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);
    setResult(null);
    setLoading(true);
    try {
      const out = await runCompareCurl({
        source_url: sourceURL.trim(),
        target_url: targetURL.trim(),
        curl_raw: curlRaw.trim(),
      });
      setResult(out);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "执行对比失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>接口对比</h2>
          <p className="page-subtitle">
            粘贴 curl 后，将请求分别发往来源 URL 与目标 URL，对比两份 JSON 结果的差异
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="curl-compare-form">
        <div className="curl-compare-field">
          <label htmlFor="curl-compare-source">来源 URL *</label>
          <input
            id="curl-compare-source"
            type="text"
            placeholder="例如 https://api-source.example.com"
            value={sourceURL}
            onChange={(e) => setSourceURL(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="curl-compare-field">
          <label htmlFor="curl-compare-target">目标 URL *</label>
          <input
            id="curl-compare-target"
            type="text"
            placeholder="例如 https://api-target.example.com"
            value={targetURL}
            onChange={(e) => setTargetURL(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="curl-compare-field">
          <label htmlFor="curl-compare-curl">curl 请求 *</label>
          <textarea
            id="curl-compare-curl"
            placeholder="粘贴完整 curl 命令，例如：&#10;curl -X GET 'https://api.example.com/users/1' -H 'Authorization: Bearer xxx'"
            value={curlRaw}
            onChange={(e) => setCurlRaw(e.target.value)}
            rows={6}
            disabled={loading}
          />
        </div>
        <div className="curl-compare-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={!canSubmit || loading}
          >
            {loading ? "执行中…" : "执行对比"}
          </button>
        </div>
      </form>

      {submitError && (
        <div className="curl-compare-submit-err">{submitError}</div>
      )}

      {result && (
        <>
          <div className="curl-compare-result-wrap">
            <div className="curl-compare-result-toolbar">
              <button
                type="button"
                className="curl-compare-fullscreen-btn"
                onClick={() => setFullscreen(true)}
                title="全屏查看"
              >
                全屏
              </button>
            </div>
            <ResultView result={result} />
          </div>
          {fullscreen && (
            <div
              className="curl-compare-fullscreen"
              role="dialog"
              aria-modal="true"
              aria-label="接口对比结果全屏"
            >
              <div className="curl-compare-fullscreen-header">
                <span className="curl-compare-fullscreen-title">接口对比结果</span>
                <button
                  type="button"
                  className="curl-compare-fullscreen-close"
                  onClick={() => setFullscreen(false)}
                >
                  退出全屏
                </button>
              </div>
              <div className="curl-compare-fullscreen-body">
                <ResultView result={result} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
