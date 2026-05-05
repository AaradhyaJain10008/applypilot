import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_APIFY_CLIENT_IMPORT_ERROR: Optional[str] = None
try:
    from apify_client import ApifyClient  # type: ignore
except Exception as exc:  # pragma: no cover - handled at runtime
    ApifyClient = None  # type: ignore
    _APIFY_CLIENT_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"


class ApifyConfigError(Exception):
    pass


class ApifySafeStop(Exception):
    pass


@dataclass
class ApifyRunResult:
    status: str
    skipped: bool
    reason: str
    run_id: str
    actor_id: str
    default_dataset_id: str
    items: List[Dict[str, Any]]
    estimated_cost_usd: float


@dataclass
class ApifyConfig:
    token: str
    discovery_actor_id: str
    enrichment_actor_id: str
    timeout_seconds: int
    max_retries: int
    # Budget guardrails
    max_cost_per_run_usd: float
    monthly_free_tier_usd: float
    min_remaining_free_tier_usd: float
    estimated_compute_units_per_run: float
    usd_per_compute_unit: float
    # Paths
    project_root: Path
    discovery_results_path: Path
    enrichment_results_path: Path
    budget_state_path: Path

    @staticmethod
    def from_env(project_root: Optional[Path] = None) -> "ApifyConfig":
        root = project_root or Path(__file__).resolve().parents[1]
        token = os.getenv("APIFY_TOKEN", "").strip()
        discovery_actor_id = os.getenv("APIFY_ACTOR_DISCOVERY_ID", "").strip()
        enrichment_actor_id = os.getenv("APIFY_ACTOR_ENRICHMENT_ID", "").strip()

        if not token:
            raise ApifyConfigError("APIFY_TOKEN is required.")
        # Discovery / enrichment actors are optional: Step 1 job scout only needs
        # APIFY_ACTOR_LINKEDIN_JOBS_ID (see app.py). Step 3 calls run_discovery /
        # run_enrichment only when these are set; see /api/config.apify_step3.

        return ApifyConfig(
            token=token,
            discovery_actor_id=discovery_actor_id,
            enrichment_actor_id=enrichment_actor_id,
            timeout_seconds=int(os.getenv("APIFY_TIMEOUT_S", "180")),
            max_retries=max(0, int(os.getenv("APIFY_MAX_RETRIES", "2"))),
            max_cost_per_run_usd=float(os.getenv("APIFY_MAX_COST_PER_RUN_USD", "0.50")),
            monthly_free_tier_usd=float(os.getenv("APIFY_MONTHLY_FREE_TIER_USD", "5.00")),
            min_remaining_free_tier_usd=float(os.getenv("APIFY_MIN_REMAINING_FREE_TIER_USD", "0.50")),
            estimated_compute_units_per_run=float(os.getenv("APIFY_ESTIMATED_CU_PER_RUN", "0.20")),
            usd_per_compute_unit=float(os.getenv("APIFY_USD_PER_COMPUTE_UNIT", "0.25")),
            project_root=root,
            discovery_results_path=root / "data" / "discovery_results.jsonl",
            enrichment_results_path=root / "data" / "enrichment_results.jsonl",
            budget_state_path=root / "data" / "apify_budget_state.json",
        )


class ApifyClientService:
    """
    Service boundary for Apify Actor execution.

    Key budget controls:
    - Deduplication: skip discovery runs when the same job/url already exists in local JSONL.
    - Safe-stop: block new runs when estimated run cost exceeds threshold or free-tier budget is low.
    """

    def __init__(self, config: Optional[ApifyConfig] = None):
        self.config = config or ApifyConfig.from_env()
        if ApifyClient is None:
            detail = (
                f" ({_APIFY_CLIENT_IMPORT_ERROR})"
                if _APIFY_CLIENT_IMPORT_ERROR
                else ""
            )
            raise ApifyConfigError(
                "apify-client could not be imported"
                f"{detail}. "
                "Install a 2.x release: `pip install 'apify-client>=2.5.0,<3'` "
                "(older 1.x breaks with current apify-shared)."
            )
        self._client = ApifyClient(self.config.token)
        self._ensure_runtime_dirs()

    def run_discovery(
        self,
        *,
        job_id: str,
        source_url: str,
        actor_input: Dict[str, Any],
    ) -> ApifyRunResult:
        if not (self.config.discovery_actor_id or "").strip():
            raise ApifyConfigError(
                "Apify Step 3 discovery is not configured: set APIFY_ACTOR_DISCOVERY_ID in .env. "
                "(This is separate from Step 1 job scout, which uses APIFY_ACTOR_LINKEDIN_JOBS_ID.)"
            )
        existing = self._find_discovery_record(job_id=job_id, source_url=source_url)
        if existing is not None:
            return ApifyRunResult(
                status="skipped",
                skipped=True,
                reason="deduplicated-local-cache-hit",
                run_id="",
                actor_id=self.config.discovery_actor_id,
                default_dataset_id="",
                items=[],
                estimated_cost_usd=0.0,
            )

        estimate = self._estimate_run_cost_usd(actor_input)
        self._guard_budget_or_raise(estimate)

        run, items = self._run_actor_with_retries(
            actor_id=self.config.discovery_actor_id,
            actor_input=actor_input,
        )
        run_id = str(run.get("id") or "")
        dataset_id = str(run.get("defaultDatasetId") or "")

        self._append_discovery_records(
            job_id=job_id,
            source_url=source_url,
            run_id=run_id,
            actor_id=self.config.discovery_actor_id,
            dataset_id=dataset_id,
            items=items,
            estimated_cost_usd=estimate,
        )
        self._record_budget_consumption(estimate)

        return ApifyRunResult(
            status=str(run.get("status") or "SUCCEEDED"),
            skipped=False,
            reason="ok",
            run_id=run_id,
            actor_id=self.config.discovery_actor_id,
            default_dataset_id=dataset_id,
            items=items,
            estimated_cost_usd=estimate,
        )

    def run_enrichment(self, *, actor_input: Dict[str, Any]) -> ApifyRunResult:
        if not (self.config.enrichment_actor_id or "").strip():
            raise ApifyConfigError(
                "Apify enrichment is not configured: set APIFY_ACTOR_ENRICHMENT_ID in .env."
            )
        estimate = self._estimate_run_cost_usd(actor_input)
        self._guard_budget_or_raise(estimate)

        run, items = self._run_actor_with_retries(
            actor_id=self.config.enrichment_actor_id,
            actor_input=actor_input,
        )
        run_id = str(run.get("id") or "")
        dataset_id = str(run.get("defaultDatasetId") or "")

        self._append_jsonl(
            self.config.enrichment_results_path,
            {
                "record_type": "enrichment_run",
                "timestamp": self._now_iso(),
                "provider": "apify",
                "actor_id": self.config.enrichment_actor_id,
                "run_id": run_id,
                "dataset_id": dataset_id,
                "item_count": len(items),
                "estimated_cost_usd": estimate,
                "items": items,
            },
        )
        self._record_budget_consumption(estimate)

        return ApifyRunResult(
            status=str(run.get("status") or "SUCCEEDED"),
            skipped=False,
            reason="ok",
            run_id=run_id,
            actor_id=self.config.enrichment_actor_id,
            default_dataset_id=dataset_id,
            items=items,
            estimated_cost_usd=estimate,
        )

    def run_actor(
        self,
        *,
        actor_id: str,
        actor_input: Dict[str, Any],
        log_path: Path,
        record_type: str,
        extra_meta: Optional[Dict[str, Any]] = None,
    ) -> ApifyRunResult:
        """Run any Apify actor with the same budget + retry semantics.

        Writes one JSON line to ``log_path`` (JSONL). Does not use discovery dedupe."""
        estimate = self._estimate_run_cost_usd(actor_input)
        self._guard_budget_or_raise(estimate)

        run, items = self._run_actor_with_retries(actor_id=actor_id, actor_input=actor_input)
        run_id = str(run.get("id") or "")
        dataset_id = str(run.get("defaultDatasetId") or "")

        payload = {
            "record_type": record_type,
            "timestamp": self._now_iso(),
            "provider": "apify",
            "actor_id": actor_id,
            "run_id": run_id,
            "dataset_id": dataset_id,
            "item_count": len(items),
            "estimated_cost_usd": estimate,
            "meta": extra_meta or {},
            "items": items,
        }
        self._append_jsonl(log_path, payload)
        self._record_budget_consumption(estimate)

        return ApifyRunResult(
            status=str(run.get("status") or "SUCCEEDED"),
            skipped=False,
            reason="ok",
            run_id=run_id,
            actor_id=actor_id,
            default_dataset_id=dataset_id,
            items=items,
            estimated_cost_usd=estimate,
        )

    def _run_actor_with_retries(
        self,
        *,
        actor_id: str,
        actor_input: Dict[str, Any],
    ) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        attempts = self.config.max_retries + 1
        last_err: Optional[Exception] = None
        for attempt in range(1, attempts + 1):
            try:
                run = self._client.actor(actor_id).call(
                    run_input=actor_input,
                    timeout_secs=self.config.timeout_seconds,
                )
                dataset_id = run.get("defaultDatasetId")
                if not dataset_id:
                    raise RuntimeError("Apify run returned no defaultDatasetId.")
                dataset_items = self._client.dataset(dataset_id).list_items().items
                return run, list(dataset_items or [])
            except Exception as err:
                last_err = err
                if attempt >= attempts:
                    break
                sleep_s = min(8, 2 ** (attempt - 1))
                time.sleep(sleep_s)
        raise RuntimeError(f"Apify actor failed after {attempts} attempt(s): {last_err}")

    def _estimate_run_cost_usd(self, actor_input: Dict[str, Any]) -> float:
        # You can tune this estimator over time with actor telemetry.
        cu_base = self.config.estimated_compute_units_per_run
        start_urls = actor_input.get("startUrls") or actor_input.get("start_urls") or []
        pages = actor_input.get("maxItems") or actor_input.get("max_items") or 0
        scale_multiplier = 1.0 + (0.05 * max(0, len(start_urls) - 1)) + (0.002 * max(0, int(pages or 0)))
        estimated_cu = cu_base * scale_multiplier
        return round(estimated_cu * self.config.usd_per_compute_unit, 4)

    def _guard_budget_or_raise(self, estimated_cost_usd: float) -> None:
        if estimated_cost_usd > self.config.max_cost_per_run_usd:
            msg = (
                "Apify safe-stop: estimated cost "
                f"${estimated_cost_usd:.2f} exceeds per-run ceiling ${self.config.max_cost_per_run_usd:.2f}."
            )
            self._append_warning(msg)
            raise ApifySafeStop(msg)

        month_state = self._load_budget_state()
        month_key = self._current_month_key()
        if month_state.get("month") != month_key:
            month_state = self._fresh_budget_state()
        spent = float(month_state.get("estimated_spent_usd", 0.0))
        remaining = self.config.monthly_free_tier_usd - spent
        projected_remaining = remaining - estimated_cost_usd
        if projected_remaining < self.config.min_remaining_free_tier_usd:
            msg = (
                "Apify safe-stop: monthly free tier almost depleted. "
                f"remaining=${remaining:.2f}, projected_remaining=${projected_remaining:.2f}, "
                f"min_required=${self.config.min_remaining_free_tier_usd:.2f}."
            )
            self._append_warning(msg)
            raise ApifySafeStop(msg)

    def _record_budget_consumption(self, estimated_cost_usd: float) -> None:
        state = self._load_budget_state()
        month_key = self._current_month_key()
        if state.get("month") != month_key:
            state = self._fresh_budget_state()
        state["estimated_spent_usd"] = round(float(state.get("estimated_spent_usd", 0.0)) + estimated_cost_usd, 4)
        state["updated_at"] = self._now_iso()
        self._write_json(self.config.budget_state_path, state)

    def _find_discovery_record(self, *, job_id: str, source_url: str) -> Optional[Dict[str, Any]]:
        if not self.config.discovery_results_path.exists():
            return None
        target_url = self._normalize_url(source_url)
        with self.config.discovery_results_path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except Exception:
                    continue
                same_job = str(row.get("job_id") or "").strip() == job_id.strip()
                same_url = self._normalize_url(str(row.get("source_url") or "")) == target_url
                if same_job and same_url:
                    return row
        return None

    def _append_discovery_records(
        self,
        *,
        job_id: str,
        source_url: str,
        run_id: str,
        actor_id: str,
        dataset_id: str,
        items: List[Dict[str, Any]],
        estimated_cost_usd: float,
    ) -> None:
        payload = {
            "record_type": "discovery_run",
            "timestamp": self._now_iso(),
            "job_id": job_id,
            "source_url": source_url,
            "provider": "apify",
            "actor_id": actor_id,
            "run_id": run_id,
            "dataset_id": dataset_id,
            "item_count": len(items),
            "estimated_cost_usd": estimated_cost_usd,
            "items": items,
        }
        self._append_jsonl(self.config.discovery_results_path, payload)

    def _append_warning(self, message: str) -> None:
        self._append_jsonl(
            self.config.project_root / "data" / "apify_warnings.jsonl",
            {
                "timestamp": self._now_iso(),
                "level": "warning",
                "message": message,
            },
        )

    def _ensure_runtime_dirs(self) -> None:
        for path in (
            self.config.discovery_results_path,
            self.config.enrichment_results_path,
            self.config.budget_state_path,
            self.config.project_root / "data" / "apify_warnings.jsonl",
            self.config.project_root / "data" / "job_scout_runs.jsonl",
        ):
            path.parent.mkdir(parents=True, exist_ok=True)

    def _append_jsonl(self, path: Path, payload: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, ensure_ascii=False) + "\n")

    def _load_budget_state(self) -> Dict[str, Any]:
        if not self.config.budget_state_path.exists():
            return self._fresh_budget_state()
        try:
            with self.config.budget_state_path.open("r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            return self._fresh_budget_state()

    def _fresh_budget_state(self) -> Dict[str, Any]:
        return {
            "month": self._current_month_key(),
            "estimated_spent_usd": 0.0,
            "monthly_free_tier_usd": self.config.monthly_free_tier_usd,
            "updated_at": self._now_iso(),
        }

    def _write_json(self, path: Path, payload: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, ensure_ascii=False)

    @staticmethod
    def _normalize_url(url: str) -> str:
        u = (url or "").strip().lower()
        if u.endswith("/"):
            u = u[:-1]
        return u

    @staticmethod
    def _current_month_key() -> str:
        now = datetime.now(timezone.utc)
        return f"{now.year:04d}-{now.month:02d}"

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat(timespec="seconds")
