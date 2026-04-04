import csv
import json
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote, urlencode


WDQS_URL = "https://query.wikidata.org/sparql"
PAGEVIEWS_URL = (
    "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
    "{project}/{access}/{agent}/{article}/{granularity}/{start}/{end}"
)

HEADERS = {
    "Accept": "application/sparql-results+json",
    "User-Agent": "monikers-card-seeder/1.0 (example@example.com)",
}

CACHE_DIR = Path(".cache")
SPARQL_CACHE_TTL_SECONDS = 24 * 60 * 60
SPARQL_BUCKET_SLEEP_SECONDS = 5.0
MAX_WDQS_RETRY_AFTER_SECONDS = 15.0
PAGEVIEWS_CACHE_TTL_SECONDS = 24 * 60 * 60

# Choose the broad buckets you want.
# A few useful Wikidata QIDs:
# human = Q5
# fictional character = Q95074
# television series = Q5398426
# film = Q11424
# video game = Q7889
# musical work = Q2188189
# sports team = Q12973014
ENTITY_TYPES = {
    "human": "Q5",
    "fictional_character": "Q95074",
    "film": "Q11424",
    "tv_series": "Q5398426",
    "video_game": "Q7889",
    "musical_work": "Q2188189",
    "sports_team": "Q12973014",
}

SPARQL_TEMPLATE = """
SELECT ?item ?itemLabel ?itemDescription ?enwikiTitle
WHERE {{
  {instance_clause}

  ?enwiki schema:about ?item ;
          schema:isPartOf <https://en.wikipedia.org/> ;
          schema:name ?enwikiTitle .

  OPTIONAL {{
    ?item rdfs:label ?itemLabel .
    FILTER(LANG(?itemLabel) = "en")
  }}

  OPTIONAL {{
    ?item schema:description ?itemDescription .
    FILTER(LANG(?itemDescription) = "en")
  }}
}}
LIMIT {limit}
"""

METADATA_SPARQL_TEMPLATE = """
SELECT
  ?item
  (GROUP_CONCAT(DISTINCT ?countryLabel; separator="; ") AS ?countries)
  (MIN(?relevanceStartCandidate) AS ?relevanceStart)
  (MAX(?relevanceEndCandidate) AS ?relevanceEnd)
WHERE {{
  VALUES ?item {{ {item_values} }}

  OPTIONAL {{
    {{ ?item wdt:P27 ?countryEntity . }}
    UNION {{ ?item wdt:P17 ?countryEntity . }}
    UNION {{ ?item wdt:P495 ?countryEntity . }}

    ?countryEntity rdfs:label ?countryLabel .
    FILTER(LANG(?countryLabel) = "en")
  }}

  OPTIONAL {{
    {{ ?item wdt:P569 ?relevanceStartCandidate . }}
    UNION {{ ?item wdt:P571 ?relevanceStartCandidate . }}
    UNION {{ ?item wdt:P577 ?relevanceStartCandidate . }}
    UNION {{ ?item wdt:P580 ?relevanceStartCandidate . }}
    UNION {{ ?item wdt:P585 ?relevanceStartCandidate . }}
  }}

  OPTIONAL {{
    {{ ?item wdt:P570 ?relevanceEndCandidate . }}
    UNION {{ ?item wdt:P576 ?relevanceEndCandidate . }}
    UNION {{ ?item wdt:P582 ?relevanceEndCandidate . }}
    UNION {{ ?item wdt:P577 ?relevanceEndCandidate . }}
    UNION {{ ?item wdt:P585 ?relevanceEndCandidate . }}
  }}
}}
GROUP BY ?item
"""


class RequestError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def instance_clause_for(entity_qid: str) -> str:
    if entity_qid == "Q5":
        return f"?item wdt:P31 wd:{entity_qid} ."
    return f"?item wdt:P31/wdt:P279* wd:{entity_qid} ."


def log(message: str) -> None:
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    sys.stdout.buffer.write((message + "\n").encode(encoding, errors="backslashreplace"))
    sys.stdout.flush()


def request_json(
    url: str,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    data: Optional[Dict[str, str]] = None,
    timeout: int = 60,
) -> Dict:
    command = [
        "curl.exe",
        "--silent",
        "--show-error",
        "--location",
        "--max-time",
        str(timeout),
        "--request",
        method,
    ]

    for key, value in (headers or {}).items():
        command.extend(["--header", f"{key}: {value}"])

    if data is not None:
        command.extend(["--data-raw", urlencode(data)])

    command.extend(["--write-out", "\n__HTTP_STATUS__:%{http_code}", url])

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            text=True,
            check=False,
        )
    except OSError as exc:
        raise RequestError(str(exc))

    if result.returncode != 0:
        raise RequestError(result.stderr.strip() or "curl request failed")

    marker = "\n__HTTP_STATUS__:"
    if marker not in result.stdout:
        raise RequestError("curl response missing HTTP status marker")

    body, status_text = result.stdout.rsplit(marker, 1)
    try:
        status_code = int(status_text.strip())
    except ValueError:
        raise RequestError("curl returned an invalid HTTP status")

    if status_code >= 400 or status_code == 0:
        error_message = body.strip() or result.stderr.strip() or "HTTP request failed"
        raise RequestError(error_message, status_code=status_code)

    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise RequestError(f"Invalid JSON response: {exc}")


def run_sparql(query: str, max_retries: int = 3, backoff_seconds: float = 2.0) -> List[Dict]:
    for attempt in range(1, max_retries + 1):
        try:
            data = request_json(
                WDQS_URL,
                method="POST",
                headers=HEADERS,
                data={"query": query},
                timeout=60,
            )
            return data.get("results", {}).get("bindings", [])
        except RequestError as exc:
            if exc.status_code == 429:
                log("WDQS rate limit hit. Reusing cached bucket data on future runs will avoid repeated waits.")
                log(
                    f"WDQS asked for a cooldown of up to {MAX_WDQS_RETRY_AFTER_SECONDS:.1f}s; "
                    f"skipping this bucket instead of waiting for an unknown duration."
                )
                return []

            if attempt == max_retries:
                log(f"run_sparql failed after {max_retries} attempts: {exc}")
                return []
            sleep_time = backoff_seconds * (2 ** (attempt - 1))
            log(f"run_sparql attempt {attempt}/{max_retries} failed: {exc}; retrying in {sleep_time:.1f}s")
            time.sleep(sleep_time)


def get_binding_value(binding: Dict, key: str, default: str = "") -> str:
    return binding.get(key, {}).get("value", default)


def get_wikidata_id(item_url: str) -> str:
    return item_url.rsplit("/", 1)[-1]


def normalize_wikidata_date(value: str) -> str:
    if not value:
        return ""

    normalized = value.lstrip("+")
    sign = ""
    if normalized.startswith("-"):
        sign = "-"
        normalized = normalized[1:]
    if "T" in normalized:
        normalized = normalized.split("T", 1)[0]
    if normalized.endswith("Z"):
        normalized = normalized[:-1]

    year = normalized.split("-", 1)[0]
    return "{0}{1}".format(sign, year) if year else ""


def pageviews_for_title(
    title: str,
    days: int = 365,
    project: str = "en.wikipedia.org",
    access: str = "all-access",
    agent: str = "user",
    granularity: str = "daily",
    sleep_seconds: float = 0.1,
    max_retries: int = 3,
    backoff_seconds: float = 1.0,
) -> int:
    end = datetime.utcnow().date() - timedelta(days=1)
    start = end - timedelta(days=days - 1)

    start_str = start.strftime("%Y%m%d")
    end_str = end.strftime("%Y%m%d")

    url = PAGEVIEWS_URL.format(
        project=project,
        access=access,
        agent=agent,
        article=quote(title, safe=""),
        granularity=granularity,
        start=start_str,
        end=end_str,
    )

    for attempt in range(1, max_retries + 1):
        try:
            data = request_json(
                url,
                method="GET",
                headers={"User-Agent": HEADERS["User-Agent"]},
                timeout=30,
            )
            total = sum(item.get("views", 0) for item in data.get("items", []))
            time.sleep(sleep_seconds)
            return total
        except RequestError as exc:
            if exc.status_code == 404:
                return 0
            if attempt == max_retries:
                raise
            sleep_time = backoff_seconds * (2 ** (attempt - 1))
            log(f"pageviews_for_title attempt {attempt}/{max_retries} failed for {title}: {exc}; retrying in {sleep_time:.1f}s")
            time.sleep(sleep_time)


def difficulty_from_pageviews(views_365d: int) -> int:
    # Tunable buckets for Monikers-like difficulty.
    # More views => easier / more mainstream.
    if views_365d >= 20_000_000:
        return 1
    if views_365d >= 5_000_000:
        return 2
    if views_365d >= 1_000_000:
        return 3
    return 4


def build_description(name: str, raw_description: str, type_label: str, occupations: str, bucket: str) -> str:
    parts = []

    if raw_description:
        parts.append(raw_description)

    if bucket:
        parts.append(f"bucket: {bucket}")

    return " | ".join(parts)[:500]


def load_json_cache(path: Path, ttl_seconds: Optional[float] = None) -> Optional[List[Dict]]:
    if not path.exists():
        return None

    if ttl_seconds is not None:
        age_seconds = time.time() - path.stat().st_mtime
        if age_seconds > ttl_seconds:
            return None

    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def save_json_cache(path: Path, payload: List[Dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)


def bucket_cache_path(bucket: str, entity_qid: str, limit: int) -> Path:
    return CACHE_DIR / f"sparql_{bucket}_{entity_qid}_{limit}.json"


def metadata_cache_path(bucket: str, entity_qid: str, limit: int) -> Path:
    return CACHE_DIR / f"metadata_v1_{bucket}_{entity_qid}_{limit}.json"


def chunked(items: List[str], size: int) -> List[List[str]]:
    return [items[index:index + size] for index in range(0, len(items), size)]


def pageviews_cache_path(days: int) -> Path:
    end = datetime.utcnow().date() - timedelta(days=1)
    return CACHE_DIR / "pageviews_{0}_{1}.json".format(days, end.strftime("%Y%m%d"))


def load_pageviews_cache(days: int) -> Dict[str, int]:
    cache_path = pageviews_cache_path(days)
    payload = load_json_cache(cache_path, PAGEVIEWS_CACHE_TTL_SECONDS)
    if isinstance(payload, dict):
        entries = payload.get("entries", {})
        if isinstance(entries, dict):
            return {str(key): int(value) for key, value in entries.items()}
    return {}


def save_pageviews_cache(days: int, entries: Dict[str, int]) -> None:
    save_json_cache(pageviews_cache_path(days), {"entries": entries})


def load_bucket_cache(bucket: str, entity_qid: str, limit: int) -> Tuple[Optional[List[Dict]], bool]:
    exact_cache_path = bucket_cache_path(bucket, entity_qid, limit)
    exact_rows = load_json_cache(exact_cache_path, SPARQL_CACHE_TTL_SECONDS)
    if exact_rows is not None:
        log(f"Using cached SPARQL results for {bucket}.")
        return exact_rows[:limit], True

    cache_pattern = f"sparql_{bucket}_{entity_qid}_*.json"
    candidate_paths = sorted(CACHE_DIR.glob(cache_pattern), key=lambda path: path.stat().st_mtime, reverse=True)
    for candidate_path in candidate_paths:
        candidate_rows = load_json_cache(candidate_path)
        if candidate_rows is not None:
            log(f"Using fallback cached SPARQL results for {bucket} from {candidate_path.name}.")
            return candidate_rows[:limit], True

    return None, False


def metadata_query_for(item_ids: List[str]) -> str:
    item_values = " ".join("wd:{0}".format(item_id) for item_id in item_ids if item_id)
    return METADATA_SPARQL_TEMPLATE.format(item_values=item_values)


def fetch_entity_metadata(bucket: str, entity_qid: str, limit: int, item_ids: List[str]) -> Dict[str, Dict[str, str]]:
    cache_path = metadata_cache_path(bucket, entity_qid, limit)
    cached_rows = load_json_cache(cache_path, SPARQL_CACHE_TTL_SECONDS)
    metadata_rows = cached_rows or []

    if cached_rows is None:
        metadata_rows = []
        for batch in chunked(item_ids, 50):
            batch_rows = run_sparql(metadata_query_for(batch))
            if batch_rows:
                metadata_rows.extend(batch_rows)
            time.sleep(1.0)

        if metadata_rows:
            save_json_cache(cache_path, metadata_rows)
        else:
            stale_rows = load_json_cache(cache_path)
            if stale_rows is not None:
                log(f"Using stale metadata cache for {bucket}.")
                metadata_rows = stale_rows

    metadata_by_item = {}
    for row in metadata_rows:
        item_url = get_binding_value(row, "item")
        item_id = get_wikidata_id(item_url)
        metadata_by_item[item_id] = {
            "country": get_binding_value(row, "countries"),
            "relevance_start": normalize_wikidata_date(get_binding_value(row, "relevanceStart")),
            "relevance_end": normalize_wikidata_date(get_binding_value(row, "relevanceEnd")),
        }

    return metadata_by_item


def fetch_entities(bucket: str, entity_qid: str, limit: int) -> Tuple[List[Dict], bool]:
    query = SPARQL_TEMPLATE.format(
        instance_clause=instance_clause_for(entity_qid),
        limit=limit,
    )
    cached_rows, from_cache = load_bucket_cache(bucket, entity_qid, limit)
    if cached_rows is not None:
        rows = cached_rows
    else:
        cache_path = bucket_cache_path(bucket, entity_qid, limit)
        rows = run_sparql(query)
        if rows:
            save_json_cache(cache_path, rows)
            from_cache = False
        else:
            stale_rows, stale_from_cache = load_bucket_cache(bucket, entity_qid, limit)
            if stale_rows is not None:
                log(f"Using stale cached SPARQL results for {bucket} after WDQS failure.")
                rows = stale_rows
                from_cache = stale_from_cache
            else:
                from_cache = False

    item_ids = [get_wikidata_id(get_binding_value(row, "item")) for row in rows if get_binding_value(row, "item")]
    metadata_by_item = fetch_entity_metadata(bucket, entity_qid, limit, item_ids) if item_ids else {}

    results = []
    for row in rows:
        item_url = get_binding_value(row, "item")
        item_id = get_wikidata_id(item_url)
        label = get_binding_value(row, "itemLabel")
        description = get_binding_value(row, "itemDescription")
        enwiki_title = get_binding_value(row, "enwikiTitle")
        metadata = metadata_by_item.get(item_id, {})

        results.append(
            {
                "wikidata_id": item_id,
                "title": label,
                "raw_description": description,
                "enwiki_title": enwiki_title,
                "country": metadata.get("country", ""),
                "relevance_start": metadata.get("relevance_start", ""),
                "relevance_end": metadata.get("relevance_end", ""),
                "type_label": "",
                "occupations": "",
            }
        )

    return results, from_cache


def collect_card_candidates(
    per_type_limit: int = 150,
    include_pageviews: bool = True,
) -> List[Dict]:
    all_cards = []
    pageview_days = 365
    pageview_cache = load_pageviews_cache(pageview_days) if include_pageviews else {}
    pageview_cache_dirty = False

    for bucket, qid in ENTITY_TYPES.items():
        log(f"Fetching {bucket}...")
        try:
            rows, from_cache = fetch_entities(bucket, qid, per_type_limit)
        except RequestError as exc:
            log(f"Skipping bucket {bucket} due to SPARQL fetch error: {exc}")
            continue

        if not from_cache:
            time.sleep(SPARQL_BUCKET_SLEEP_SECONDS)

        for row in rows:
            title = row["title"].strip()
            if not title:
                continue

            enwiki_title = row["enwiki_title"].strip()
            views_365d = 0

            if include_pageviews and enwiki_title:
                cached_views = pageview_cache.get(enwiki_title)
                if cached_views is not None:
                    views_365d = cached_views
                else:
                    try:
                        views_365d = pageviews_for_title(enwiki_title, days=pageview_days)
                        pageview_cache[enwiki_title] = views_365d
                        pageview_cache_dirty = True
                        if len(pageview_cache) % 25 == 0:
                            save_pageviews_cache(pageview_days, pageview_cache)
                    except Exception as exc:
                        log(f"Pageviews failed for {enwiki_title}: {exc}")

            card = {
                "wikidata_id": row["wikidata_id"],
                "title": title,
                "description": build_description(
                    name=title,
                    raw_description=row["raw_description"],
                    type_label=row["type_label"],
                    occupations=row["occupations"],
                    bucket=bucket,
                ),
                "bucket": bucket,
                "enwiki_title": enwiki_title,
                "country": row["country"],
                "relevance_start": row["relevance_start"],
                "relevance_end": row["relevance_end"],
                "pageviews_365d": views_365d,
                "points": difficulty_from_pageviews(views_365d) if enwiki_title else 4,
            }
            all_cards.append(card)

    if include_pageviews and pageview_cache_dirty:
        save_pageviews_cache(pageview_days, pageview_cache)

    # Deduplicate by title, keeping the version with the highest pageviews.
    deduped = {}
    for card in all_cards:
        key = card["title"].strip().lower()
        existing = deduped.get(key)
        if existing is None or card["pageviews_365d"] > existing["pageviews_365d"]:
            deduped[key] = card

    result = list(deduped.values())
    result.sort(key=lambda x: (x["points"], -x["pageviews_365d"], x["title"]))
    return result


def save_csv(cards: List[Dict], path: str = "wikidata_cards.csv") -> None:
    fieldnames = [
        "wikidata_id",
        "title",
        "description",
        "bucket",
        "enwiki_title",
        "country",
        "relevance_start",
        "relevance_end",
        "pageviews_365d",
        "points",
    ]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(cards)


if __name__ == "__main__":
    try:
        cards = collect_card_candidates(per_type_limit=150, include_pageviews=True)
        save_csv(cards, "wikidata_cards.csv")
        log(f"Saved {len(cards)} cards to wikidata_cards.csv")
    except KeyboardInterrupt:
        log("Cancelled.")
