#!/usr/bin/env python3
"""
DevPilot skill-creator 工具入口：从 stdin 读入。

- 若为合法 JSON 且含非空的 name、description：在技能目录下写入 SKILL.md（默认可用
  DEVPILOT_SKILLS_DIR 或 ~/.devpilot/skills）。
- 否则以退出码 3 退出，由运行时回退为「用本技能正文 + 用户输入」的子轮 LLM（审核、
  讨论、非落盘类请求）。

JSON 字段（object）：
  name, description — 必填（trim 后非空）
  body — 可选，默认一段占位说明
  rule_chain_id — 可选，写入 frontmatter
  overwrite — 可选 bool，为 true 时允许覆盖已有 SKILL.md
  skills_base — 可选，技能根目录绝对/相对路径（expanduser）

支持外层 { "input": "<内层 JSON 字符串>" }，与部分模型序列化方式兼容。
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

# 与 skill_executor 中 command_llm_fallback_exit 约定一致
FALLBACK_EXIT = 3


def normalize_skill_dir_name(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    s = re.sub(r"-{2,}", "-", s)
    return s


def default_skills_base() -> Path:
    env = os.environ.get("DEVPILOT_SKILLS_DIR", "").strip()
    if env:
        return Path(env).expanduser().resolve()
    return (Path.home() / ".devpilot" / "skills").resolve()


def yaml_escape_line(s: str) -> str:
    return s.replace("\n", " ").replace("\r", " ")


def build_skill_md(name: str, desc: str, body: str, rule_chain_id: str) -> str:
    lines = [
        "---",
        f"name: {yaml_escape_line(name)}",
        f"description: {yaml_escape_line(desc)}",
    ]
    rid = rule_chain_id.strip()
    if rid:
        lines.append(f"rule_chain_id: {rid}")
    fm = "\n".join(lines) + "\n---\n\n"
    return fm + body.rstrip() + "\n"


def parse_payload(raw: str) -> dict | None:
    t = raw.strip()
    if not t:
        return None
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict):
        return None
    inner = obj.get("input")
    if isinstance(inner, str) and inner.strip():
        try:
            obj = json.loads(inner)
        except json.JSONDecodeError:
            return None
        if not isinstance(obj, dict):
            return None
    return obj


def main() -> None:
    raw = sys.stdin.read()
    obj = parse_payload(raw)
    if obj is None:
        sys.exit(FALLBACK_EXIT)

    name = str(obj.get("name", "")).strip()
    desc = str(obj.get("description", "")).strip()
    if not name or not desc:
        sys.exit(FALLBACK_EXIT)

    body = str(obj.get("body", "")).strip()
    if not body:
        body = (
            "This skill provides guidance; replace this section with full SKILL.md body "
            "content per the Skill Creator principles in the bundled documentation."
        )

    rule_id = str(obj.get("rule_chain_id", "")).strip()
    overwrite = bool(obj.get("overwrite", False))

    sb = obj.get("skills_base")
    if sb is not None and str(sb).strip():
        base = Path(str(sb).strip()).expanduser().resolve()
    else:
        base = default_skills_base()

    slug = normalize_skill_dir_name(name)
    if not slug:
        print("[ERROR] name normalizes to empty directory name", file=sys.stderr)
        sys.exit(1)

    skill_dir = base / slug
    skill_md = skill_dir / "SKILL.md"

    if skill_md.is_file() and not overwrite:
        print(
            f"[ERROR] SKILL.md already exists: {skill_md}. "
            "Pass overwrite=true in JSON to replace.",
            file=sys.stderr,
        )
        sys.exit(1)

    skill_dir.mkdir(parents=True, exist_ok=True)
    skill_md.write_text(build_skill_md(name, desc, body, rule_id), encoding="utf-8")
    print(f"[OK] Wrote {skill_md}")


if __name__ == "__main__":
    main()
