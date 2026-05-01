"""Profile / resume / app-settings loader for Career Command Center.

The app is configured by THREE JSON files in the config/ directory:

    config/profile.json         -> who you are, your achievements, voice rules
    config/resume_personas.json -> the resume variants you keep in resumes/
    config/app_settings.json    -> feature flags, UI text, limits

Each file has a sibling *.example.json template that ships in the repo.
The loader prefers the user's real file and falls back to the example so
the app still boots out of the box for someone who just cloned the repo.

Loaders are intentionally tolerant — if a key is missing, you get a sensible
default so partial configs do not crash startup.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

_PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))


def _resolve_project_path(path: str) -> str:
    """Resolve relative config paths against the project root, not cwd."""
    if not path:
        return path
    if os.path.isabs(path):
        return path
    return os.path.join(_PROJECT_ROOT, path)


def _read_json_with_fallback(primary_path: str, example_path: str) -> Dict[str, Any]:
    """Load a JSON file, falling back to its *.example.json sibling if missing."""
    primary_resolved = _resolve_project_path(primary_path)
    example_resolved = _resolve_project_path(example_path)
    for path in (primary_resolved, example_resolved):
        if not path:
            continue
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh) or {}
        except Exception as exc:
            print(f"[config] Failed to parse {path}: {exc}")
            continue
    print(
        f"[config] No config file found at {primary_resolved!r} or {example_resolved!r}; "
        "using empty defaults."
    )
    return {}


# ---------------------------------------------------------------------------
# Profile loader
# ---------------------------------------------------------------------------


class CandidateProfile:
    """Wraps the candidate profile JSON with safe accessors and prompt builders."""

    def __init__(self, raw: Dict[str, Any]):
        self.raw = raw or {}
        self.candidate = self.raw.get("candidate") or {}
        self.education = self.raw.get("education") or []
        self.networking = self.raw.get("networking") or {}
        self.voice = self.raw.get("voice") or {}
        self.achievements = self.raw.get("achievements") or []
        self.ai_tools = self.raw.get("ai_tools_experience") or {}
        self.sponsorship_baseline = self.raw.get("sponsorship_baseline") or ""
        self.experience_baseline = self.raw.get("experience_baseline") or ""

    # -- simple accessors -------------------------------------------------
    @property
    def full_name(self) -> str:
        return (self.candidate.get("full_name") or "the candidate").strip()

    @property
    def preferred_name(self) -> str:
        return (
            self.candidate.get("preferred_name")
            or self.full_name.split(" ")[0]
            or "the candidate"
        ).strip()

    @property
    def headline(self) -> str:
        return (self.candidate.get("headline") or "").strip()

    @property
    def location(self) -> str:
        return (self.candidate.get("location") or "").strip()

    @property
    def open_to_relocation(self) -> bool:
        return bool(self.candidate.get("open_to_relocation"))

    @property
    def work_authorization(self) -> str:
        return (self.candidate.get("work_authorization") or "").strip()

    @property
    def signoff_name(self) -> str:
        return (
            self.candidate.get("signoff_name") or self.full_name
        ).strip()

    @property
    def links(self) -> Dict[str, str]:
        return self.candidate.get("links") or {}

    @property
    def contact_urls_for_cover_letter(self) -> List[str]:
        out: List[str] = []
        for key in ("portfolio", "linkedin", "github"):
            value = (self.links.get(key) or "").strip()
            if value:
                out.append(value)
        return out

    @property
    def alumni_search_enabled(self) -> bool:
        return bool(self.networking.get("enable_alumni_search"))

    @property
    def alumni_school_slug(self) -> str:
        return (self.networking.get("alumni_school_slug") or "").strip()

    @property
    def alumni_button_label(self) -> str:
        return (self.networking.get("alumni_button_label") or "Alumni Search").strip()

    @property
    def alumni_button_emoji(self) -> str:
        return (self.networking.get("alumni_emoji") or "").strip()

    @property
    def banned_phrases(self) -> List[str]:
        return [str(p).strip() for p in (self.voice.get("banned_phrases") or []) if str(p).strip()]

    @property
    def signature_phrases(self) -> List[str]:
        return [str(p).strip() for p in (self.voice.get("signature_phrases") or []) if str(p).strip()]

    # -- composite text helpers ------------------------------------------
    def render_education_block(self) -> str:
        """Plain-text education list for prompts. Locks in exact_phrasing_required."""
        if not self.education:
            return "(No education listed in profile.)"
        lines = []
        for entry in self.education:
            level = (entry.get("level") or "").strip().lower()
            degree = (entry.get("degree") or "").strip()
            inst = (entry.get("institution") or "").strip()
            grad = (entry.get("graduation") or "").strip()
            gpa = (entry.get("gpa") or "").strip()
            phrasing = (entry.get("exact_phrasing_required") or "").strip()
            bullet = f"- {level.title() or 'Education'}: {degree}, {inst}"
            if grad:
                bullet += f" ({grad})"
            if gpa:
                bullet += f", GPA {gpa}"
            if phrasing:
                bullet += f". NOTE: {phrasing}"
            lines.append(bullet)
        return "\n".join(lines)

    def render_achievements_block(self) -> str:
        if not self.achievements:
            return "(No achievements listed in profile.)"
        lines = []
        for ach in self.achievements:
            label = (ach.get("label") or "").strip()
            desc = (ach.get("description") or "").strip()
            if label and desc:
                lines.append(f"- {label}: {desc}")
            elif desc:
                lines.append(f"- {desc}")
        return "\n".join(lines) or "(No achievements listed in profile.)"

    def render_voice_block(self) -> str:
        parts = []
        sig = self.signature_phrases
        if sig:
            parts.append("Signature phrases the candidate uses naturally: " + ", ".join(f'"{p}"' for p in sig))
        banned = self.banned_phrases
        if banned:
            parts.append("Banned phrases (NEVER use these): " + ", ".join(f'"{p}"' for p in banned))
        return "\n".join(parts) or "(No voice rules configured.)"

    def render_ai_tools_block(self) -> str:
        if not self.ai_tools.get("has_experience"):
            return ""
        summary = (self.ai_tools.get("summary") or "").strip()
        facts = [str(f).strip() for f in (self.ai_tools.get("specific_facts") or []) if str(f).strip()]
        block = ["AI TOOLS & AGENTIC WORKFLOWS (use these specifically when the JD mentions LLMs/AI/agents/automation):"]
        if summary:
            block.append(summary)
        for fact in facts:
            block.append(f"- {fact}")
        return "\n".join(block)

    def render_candidate_bio_block(self) -> str:
        """The big bio block injected into every generation prompt."""
        sections = []
        sections.append(f"CANDIDATE: {self.full_name}")
        if self.headline:
            sections.append(f"Headline: {self.headline}")
        if self.location:
            relocation = " (open to relocation)" if self.open_to_relocation else ""
            sections.append(f"Location: {self.location}{relocation}")
        if self.work_authorization:
            sections.append(f"Work Authorization: {self.work_authorization}")
        sections.append("Education:\n" + self.render_education_block())
        sections.append("Achievements (cite verbatim — do not invent new numbers):\n" + self.render_achievements_block())
        ai_block = self.render_ai_tools_block()
        if ai_block:
            sections.append(ai_block)
        voice = self.render_voice_block()
        if voice and "(No voice rules" not in voice:
            sections.append(voice)
        return "\n\n".join(sections)

    def render_user_context_block(self) -> str:
        """A short context block the analyzer uses for sponsorship/seniority grading."""
        parts = []
        if self.sponsorship_baseline:
            parts.append(f"Sponsorship baseline: {self.sponsorship_baseline}")
        if self.work_authorization:
            parts.append(f"Work authorization: {self.work_authorization}")
        if self.location:
            relocation = " (open to relocation)" if self.open_to_relocation else ""
            parts.append(f"Location: {self.location}{relocation}")
        if self.experience_baseline:
            parts.append(f"Experience baseline: {self.experience_baseline}")
        if not parts:
            return "(No candidate context configured.)"
        return "\n".join(parts)


# ---------------------------------------------------------------------------
# Resume personas loader
# ---------------------------------------------------------------------------


class ResumePersonas:
    """Wraps the resume_personas JSON. Provides legacy-style RESUMES dict +
    rich access to per-persona metadata for prompt building."""

    def __init__(self, raw: Dict[str, Any], resume_dir: str = "resumes"):
        self.raw = raw or {}
        self.resume_dir = resume_dir or "resumes"
        self.personas: List[Dict[str, Any]] = list(self.raw.get("personas") or [])
        self.default_code: str = (
            (self.raw.get("default_code") or (self.personas[0].get("code") if self.personas else "DA"))
            .strip()
            .upper()
        )
        self.selection_priority: List[str] = [
            str(c).strip().upper()
            for c in (self.raw.get("selection_priority") or [])
            if str(c).strip()
        ]

    # -- legacy-shape accessors ------------------------------------------
    @property
    def resumes_map(self) -> Dict[str, str]:
        """{code: relative-path-to-pdf} — replaces the old hardcoded RESUMES."""
        out: Dict[str, str] = {}
        for p in self.personas:
            code = (p.get("code") or "").strip().upper()
            filename = (p.get("filename") or "").strip()
            if not code or not filename:
                continue
            # Allow absolute paths too, but otherwise live under resume_dir.
            if os.path.isabs(filename):
                out[code] = filename
            else:
                out[code] = os.path.join(self.resume_dir, filename)
        return out

    @property
    def labels_map(self) -> Dict[str, str]:
        out: Dict[str, str] = {}
        for p in self.personas:
            code = (p.get("code") or "").strip().upper()
            label = (p.get("label") or code).strip()
            if code:
                out[code] = label
        return out

    @property
    def codes(self) -> List[str]:
        return [c for c in self.resumes_map.keys()]

    def get(self, code: str) -> Optional[Dict[str, Any]]:
        wanted = (code or "").strip().upper()
        for p in self.personas:
            if (p.get("code") or "").strip().upper() == wanted:
                return p
        return None

    def rationale_fallback(self, code: str) -> str:
        entry = self.get(code) or {}
        return (entry.get("rationale_fallback") or "").strip()

    # -- prompt-text rendering -------------------------------------------
    def render_personas_block(self) -> str:
        """Big text block listing every persona with triggers — fed into prompts."""
        if not self.personas:
            return "(No resume personas configured. Edit config/resume_personas.json to add at least one.)"
        out_lines = ["Each persona below corresponds to a real resume PDF. Pick exactly ONE per JD."]
        for idx, p in enumerate(self.personas, start=1):
            code = (p.get("code") or "").strip().upper()
            label = (p.get("label") or code).strip()
            voice = (p.get("persona_voice") or "").strip()
            stack = ", ".join(p.get("core_stack") or [])
            metrics = (p.get("lead_metrics") or "").strip()
            triggers = p.get("triggers") or []
            block = [
                "-----------------------------------------------------------------",
                f"{idx}. {code} — {label}",
                "-----------------------------------------------------------------",
            ]
            if voice:
                block.append(f"Persona voice: {voice}")
            if stack:
                block.append(f"Core stack: {stack}")
            if metrics:
                block.append(f"Lead metrics (cite verbatim): {metrics}")
            if triggers:
                block.append("PICK " + code + " WHEN THE JD SAYS (any of these):")
                for t in triggers:
                    block.append(f"    - {t}")
            out_lines.append("\n".join(block))
        priority_line = ""
        if self.selection_priority:
            priority_line = (
                "\nPERSONA-SELECTION PRIORITY (when multiple personas match a JD, the FIRST in this list wins): "
                + " > ".join(self.selection_priority)
            )
        return "\n\n".join(out_lines) + priority_line

    def code_list_for_prompt(self) -> str:
        codes = self.codes or [self.default_code]
        return " | ".join(f'"{c}"' for c in codes)


# ---------------------------------------------------------------------------
# App settings loader
# ---------------------------------------------------------------------------


class AppSettings:
    """Wraps app_settings.json (feature flags, UI text, limits)."""

    def __init__(self, raw: Dict[str, Any]):
        self.raw = raw or {}
        self.features: Dict[str, Any] = self.raw.get("features") or {}
        self.ui: Dict[str, Any] = self.raw.get("ui") or {}
        self.limits: Dict[str, Any] = self.raw.get("limits") or {}
        self.scheduler: Dict[str, Any] = self.raw.get("scheduler") or {}

    def feature(self, key: str, default: bool = False) -> bool:
        if key in self.features:
            return bool(self.features.get(key))
        return default

    def ui_text(self, key: str, default: str = "") -> str:
        v = self.ui.get(key)
        return str(v) if v is not None else default

    def ui_int(self, key: str, default: int) -> int:
        try:
            return int(self.ui.get(key, default))
        except Exception:
            return default

    def limit(self, key: str, default: int) -> int:
        try:
            return int(self.limits.get(key, default))
        except Exception:
            return default

    def scheduler_int(self, key: str, default: int) -> int:
        try:
            return int(self.scheduler.get(key, default))
        except Exception:
            return default


# ---------------------------------------------------------------------------
# Public loaders
# ---------------------------------------------------------------------------


def load_profile(env_path: Optional[str] = None) -> CandidateProfile:
    primary = env_path or os.getenv("PROFILE_CONFIG_PATH", "config/profile.json")
    example = "config/profile.example.json"
    return CandidateProfile(_read_json_with_fallback(primary, example))


def load_resume_personas(
    env_path: Optional[str] = None,
    resume_dir: Optional[str] = None,
) -> ResumePersonas:
    primary = env_path or os.getenv("RESUME_CONFIG_PATH", "config/resume_personas.json")
    example = "config/resume_personas.example.json"
    raw = _read_json_with_fallback(primary, example)
    rdir = resume_dir or os.getenv("RESUME_DIR", "resumes")
    return ResumePersonas(raw, resume_dir=_resolve_project_path(rdir))


def load_app_settings(env_path: Optional[str] = None) -> AppSettings:
    primary = env_path or os.getenv("APP_SETTINGS_PATH", "config/app_settings.json")
    example = "config/app_settings.example.json"
    return AppSettings(_read_json_with_fallback(primary, example))
