from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote, urlencode


WDQS_URL = "https://query.wikidata.org/sparql"
WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php"
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
WIKIPEDIA_LEAD_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60
TEST_ROW_LIMIT = 200
RAW_CANDIDATE_LIMIT = 300
MIN_PAGEVIEWS_365D = 100_000
PAGEVIEW_MAX_WORKERS = 6
THRESHOLD_BUCKET_FETCH_MULTIPLIER = 20
OUTPUT_PATH = Path("wikidata_cards.json")

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

SUBCLASS_PATH_EXCLUDE = {
    "anatomical entity",
    "animalia",
    "being",
    "concrete object",
    "consumer",
    "continuant",
    "entity",
    "heterotroph",
    "independent continuant",
    "individual",
    "individual animal",
    "individual item",
    "individual organism",
    "legal person",
    "mammal",
    "material entity",
    "natural person",
    "object",
    "omnivore",
    "organism",
    "person",
    "person or organization",
    "physical anatomical entity",
    "physical object",
    "vertebrate",
}

NOTABLE_LINK_EXCLUDE = {
    "American Broadcasting Company",
    "Billboard (magazine)",
    "Broadway theatre",
    "Canadian Hot 100",
    "Manhattan",
    "New York City",
    "Off-Broadway",
    "PaleyFest",
    "Peacock (streaming service)",
    "Professional Performing Arts School",
}

BEST_KNOWN_KEYWORDS = ("best known", "known for")
SUPPORTING_NOTABLE_KEYWORDS = (
    "played",
    "playing",
    "roles in",
    "role in",
    "role as",
    "starred",
    "starring",
    "hosted",
)
MEDIA_CONTEXT_KEYWORDS = ("sitcom", "series", "film", "show", "musical", "broadway", "television")

SPARQL_TEMPLATE = """
SELECT ?item ?itemLabel ?itemDescription ?enwikiTitle ?sitelinks
WHERE {{
  {instance_clause}

  ?enwiki schema:about ?item ;
          schema:isPartOf <https://en.wikipedia.org/> ;
          schema:name ?enwikiTitle .
  ?item wikibase:sitelinks ?sitelinks .

  OPTIONAL {{
    ?item rdfs:label ?itemLabel .
    FILTER(LANG(?itemLabel) = "en")
  }}

  OPTIONAL {{
    ?item schema:description ?itemDescription .
    FILTER(LANG(?itemDescription) = "en")
  }}
}}
ORDER BY DESC(?sitelinks)
LIMIT {limit}
"""

METADATA_SPARQL_TEMPLATE = """
SELECT
  ?item
  (GROUP_CONCAT(DISTINCT ?alias; separator="; ") AS ?aliases)
  (GROUP_CONCAT(DISTINCT ?instanceLabel; separator="; ") AS ?instanceOf)
  (GROUP_CONCAT(DISTINCT ?subclassLabel; separator="; ") AS ?subclassPath)
  (GROUP_CONCAT(DISTINCT ?occupationLabel; separator="; ") AS ?occupations)
  (GROUP_CONCAT(DISTINCT ?genreLabel; separator="; ") AS ?genres)
  (GROUP_CONCAT(DISTINCT ?franchiseLabel; separator="; ") AS ?franchiseOrSeries)
  (GROUP_CONCAT(DISTINCT ?genderLabel; separator="; ") AS ?genders)
  (GROUP_CONCAT(DISTINCT ?notableLabel; separator="; ") AS ?notableFor)
  (GROUP_CONCAT(DISTINCT ?countryLabel; separator="; ") AS ?countries)
  (MIN(?relevanceStartCandidate) AS ?relevanceStart)
  (MAX(?relevanceEndCandidate) AS ?relevanceEnd)
WHERE {{
  VALUES ?item {{ {item_values} }}

  OPTIONAL {{
    ?item skos:altLabel ?alias .
    FILTER(LANG(?alias) = "en")
  }}

  OPTIONAL {{
    ?item wdt:P31 ?instanceEntity .
    ?instanceEntity rdfs:label ?instanceLabel .
    FILTER(LANG(?instanceLabel) = "en")
  }}

  OPTIONAL {{
    ?item wdt:P31 ?instanceEntity .
    ?instanceEntity wdt:P279+ ?subclassEntity .
    ?subclassEntity rdfs:label ?subclassLabel .
    FILTER(LANG(?subclassLabel) = "en")
  }}

  OPTIONAL {{
    ?item wdt:P106 ?occupationEntity .
    ?occupationEntity rdfs:label ?occupationLabel .
    FILTER(LANG(?occupationLabel) = "en")
  }}

  OPTIONAL {{
    ?item wdt:P136 ?genreEntity .
    ?genreEntity rdfs:label ?genreLabel .
    FILTER(LANG(?genreLabel) = "en")
  }}

  OPTIONAL {{
    {{ ?item wdt:P179 ?franchiseEntity . }}
    UNION {{ ?item wdt:P1441 ?franchiseEntity . }}
    ?franchiseEntity rdfs:label ?franchiseLabel .
    FILTER(LANG(?franchiseLabel) = "en")
  }}

  OPTIONAL {{
    ?item wdt:P21 ?genderEntity .
    ?genderEntity rdfs:label ?genderLabel .
    FILTER(LANG(?genderLabel) = "en")
  }}

  OPTIONAL {{
    ?item wdt:P800 ?notableEntity .
    ?notableEntity rdfs:label ?notableLabel .
    FILTER(LANG(?notableLabel) = "en")
  }}

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
    try:
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


def build_description(
    name: str,
    raw_description: str,
    occupations: List[str],
    bucket: str,
    notable_for: List[str],
) -> str:
    parts = []

    if raw_description:
        parts.append(raw_description)

    if notable_for:
        parts.append("known for: {0}".format("; ".join(notable_for[:2])))
    elif occupations:
        parts.append("occupations: {0}".format("; ".join(occupations[:2])))

    if bucket:
        parts.append(f"bucket: {bucket}")

    return " | ".join(parts)[:500]


def split_grouped_values(value: str, exclude: Optional[List[str]] = None, limit: Optional[int] = None) -> List[str]:
    excluded = {item.strip().lower() for item in (exclude or []) if item and item.strip()}
    result = []
    seen = set()

    for part in value.split(";"):
        normalized = part.strip()
        if not normalized:
            continue
        key = normalized.lower()
        if key in excluded or key in seen:
            continue
        result.append(normalized)
        seen.add(key)
        if limit is not None and len(result) >= limit:
            break

    return result


def first_grouped_value(value: str) -> str:
    values = split_grouped_values(value, limit=1)
    return values[0] if values else ""


def compute_pageviews_trend(views_30d: int, views_365d: int) -> float:
    if views_30d <= 0 or views_365d <= 0:
        return 0.0

    expected_recent_views = max((views_365d / 365.0) * 30.0, 1.0)
    return round(views_30d / expected_recent_views, 3)


def filter_subclass_path(values: List[str]) -> List[str]:
    filtered_values = [
        value
        for value in values
        if value and value.strip().lower() not in SUBCLASS_PATH_EXCLUDE
    ]
    return filtered_values[:8]


def wikipedia_lead_cache_path(title: str) -> Path:
    title_hash = hashlib.sha1(title.encode("utf-8")).hexdigest()
    return CACHE_DIR / f"wikipedia_lead_v1_{title_hash}.json"


def fetch_wikipedia_lead_data(title: str) -> Dict[str, Any]:
    cache_path = wikipedia_lead_cache_path(title)
    cached_payload = load_json_cache(cache_path, WIKIPEDIA_LEAD_CACHE_TTL_SECONDS)
    if isinstance(cached_payload, dict):
        return cached_payload

    extract_params = {
        "action": "query",
        "prop": "extracts",
        "titles": title,
        "exintro": "1",
        "explaintext": "1",
        "format": "json",
        "formatversion": "2",
    }
    extract_url = "{0}?{1}".format(WIKIPEDIA_API_URL, urlencode(extract_params))
    extract_data = request_json(
        extract_url,
        headers={"User-Agent": HEADERS["User-Agent"]},
        timeout=30,
    )
    extract_pages = extract_data.get("query", {}).get("pages", [])
    extract = extract_pages[0].get("extract", "") if extract_pages else ""

    links_params = {
        "action": "parse",
        "page": title,
        "prop": "links",
        "section": "0",
        "format": "json",
        "formatversion": "2",
    }
    links_url = "{0}?{1}".format(WIKIPEDIA_API_URL, urlencode(links_params))
    links_data = request_json(
        links_url,
        headers={"User-Agent": HEADERS["User-Agent"]},
        timeout=30,
    )

    payload = {
        "extract": extract,
        "links": links_data.get("parse", {}).get("links", []),
    }
    save_json_cache(cache_path, payload)
    return payload


def extract_title_variants(title: str) -> List[str]:
    variants = [title]
    if " (" in title:
        variants.append(title.split(" (", 1)[0])
    return variants


def derive_notable_for_from_lead(
    title: str,
    aliases: List[str],
    lead_extract: str,
    lead_links: List[Dict[str, Any]],
) -> List[str]:
    if not lead_extract or not lead_links:
        return []

    excluded_titles = {title.strip().lower()}
    excluded_titles.update(alias.strip().lower() for alias in aliases if alias.strip())
    excluded_titles.update(item.lower() for item in NOTABLE_LINK_EXCLUDE)

    sentences = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", lead_extract) if sentence.strip()]
    scored_candidates = []

    for link_index, link in enumerate(lead_links):
        if link.get("ns") != 0 or not link.get("exists"):
            continue

        link_title = str(link.get("title", "")).strip()
        if not link_title or link_title.lower() in excluded_titles:
            continue
        if any(token in link_title.lower() for token in ("award", "magazine", "school", "festival", "company", "policy", "chart")):
            continue

        link_variants = extract_title_variants(link_title)
        best_score = None
        best_match = ""

        for sentence_index, sentence in enumerate(sentences[:4]):
            sentence_lower = sentence.lower()
            for variant in link_variants:
                if variant and variant in sentence:
                    match_index = sentence.find(variant)
                    left_context = sentence_lower[max(0, match_index - 40):match_index]
                    right_context = sentence_lower[match_index + len(variant):match_index + len(variant) + 30]
                    score = 100 - (sentence_index * 15) - link_index
                    if any(keyword in sentence_lower for keyword in BEST_KNOWN_KEYWORDS):
                        score += 300
                    elif any(keyword in sentence_lower for keyword in SUPPORTING_NOTABLE_KEYWORDS):
                        score += 80
                    if any(token in sentence_lower for token in MEDIA_CONTEXT_KEYWORDS):
                        score += 25
                    if any(token in left_context for token in ("sitcom ", "series ", "film ", "show ", "musical ", "broadway ", "television ")):
                        score += 60
                    if "(" in right_context:
                        score += 20
                    if any(token in left_context for token in ("playing ", "as ", "portraying ")):
                        score -= 80
                    if best_score is None or score > best_score:
                        best_score = score
                        best_match = variant

        if best_score is not None:
            scored_candidates.append((best_score, link_index, best_match, link_title))

    scored_candidates.sort(key=lambda item: (-item[0], item[1], item[2]))
    score_floor = None
    if scored_candidates:
        score_floor = max(150, scored_candidates[0][0] - 120)

    result = []
    seen = set()
    for score, _, match_title, link_title in scored_candidates:
        if score_floor is not None and score < score_floor:
            continue
        chosen_title = match_title or link_title
        normalized = chosen_title.strip().lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        result.append(chosen_title)
        if len(result) >= 4:
            break

    if result:
        return result

    for _, _, match_title, link_title in scored_candidates:
        chosen_title = match_title or link_title
        normalized = chosen_title.strip().lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        result.append(chosen_title)
        if len(result) >= 2:
            break

    return result


def load_json_cache(path: Path, ttl_seconds: Optional[float] = None) -> Optional[Any]:
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


def save_json_cache(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)


def bucket_cache_path(bucket: str, entity_qid: str, limit: int) -> Path:
    return CACHE_DIR / f"sparql_{bucket}_{entity_qid}_{limit}.json"


def metadata_cache_path(bucket: str, entity_qid: str, item_ids: List[str]) -> Path:
    cache_key = hashlib.sha1(" ".join(sorted(item_ids)).encode("utf-8")).hexdigest()[:12] if item_ids else "empty"
    return CACHE_DIR / f"metadata_v3_{bucket}_{entity_qid}_{len(item_ids)}_{cache_key}.json"


def chunked(items: List[str], size: int) -> List[List[str]]:
    return [items[index:index + size] for index in range(0, len(items), size)]


def pageviews_cache_path(days: int) -> Path:
    end = datetime.utcnow().date() - timedelta(days=1)
    return CACHE_DIR / "pageviews_{0}_{1}.json".format(days, end.strftime("%Y%m%d"))


def load_pageviews_cache(days: int) -> Dict[str, int]:
    cache_path = pageviews_cache_path(days)
    payload = load_json_cache(cache_path, PAGEVIEWS_CACHE_TTL_SECONDS)
    used_fallback_cache = False

    if payload is None:
        cache_pattern = "pageviews_{0}_*.json".format(days)
        candidate_paths = sorted(CACHE_DIR.glob(cache_pattern), key=lambda path: path.stat().st_mtime, reverse=True)
        for candidate_path in candidate_paths:
            payload = load_json_cache(candidate_path)
            if payload is not None:
                log(f"Using fallback pageviews cache from {candidate_path.name}.")
                used_fallback_cache = True
                break

    if isinstance(payload, dict):
        entries = payload.get("entries", {})
        if isinstance(entries, dict):
            normalized_entries = {str(key): int(value) for key, value in entries.items()}
            if used_fallback_cache:
                save_pageviews_cache(days, normalized_entries)
            return normalized_entries
    return {}


def save_pageviews_cache(days: int, entries: Dict[str, int]) -> None:
    save_json_cache(pageviews_cache_path(days), {"entries": entries})


def resolve_pageviews_batch(
    titles: List[str],
    days: int,
    cache: Dict[str, int],
    worker_count: int = PAGEVIEW_MAX_WORKERS,
) -> Tuple[Dict[str, int], bool]:
    resolved = {}
    cache_dirty = False
    unique_titles = []
    seen = set()

    for title in titles:
        normalized = title.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique_titles.append(normalized)

    pending_titles = []
    for title in unique_titles:
        cached_value = cache.get(title)
        if cached_value is not None:
            resolved[title] = cached_value
        else:
            pending_titles.append(title)

    if not pending_titles:
        return resolved, cache_dirty

    with ThreadPoolExecutor(max_workers=max(1, worker_count)) as executor:
        future_to_title = {
            executor.submit(pageviews_for_title, title, days, sleep_seconds=0.0): title
            for title in pending_titles
        }

        completed = 0
        total = len(pending_titles)
        for future in as_completed(future_to_title):
            title = future_to_title[future]
            try:
                views = future.result()
            except Exception as exc:
                log(f"Pageviews failed for {title}: {exc}")
                views = 0

            resolved[title] = views
            cache[title] = views
            cache_dirty = True
            completed += 1

            if completed % 10 == 0 or completed == total:
                log(f"Resolved {completed}/{total} pageview requests for {days}d window.")
            if completed % 25 == 0:
                save_pageviews_cache(days, cache)

    return resolved, cache_dirty


def load_bucket_cache(
    bucket: str,
    entity_qid: str,
    limit: int,
    allow_undersized_fallback: bool = False,
) -> Tuple[Optional[List[Dict]], bool]:
    exact_cache_path = bucket_cache_path(bucket, entity_qid, limit)
    exact_rows = load_json_cache(exact_cache_path, SPARQL_CACHE_TTL_SECONDS)
    if exact_rows is not None:
        log(f"Using cached SPARQL results for {bucket}.")
        return exact_rows[:limit], True

    cache_pattern = f"sparql_{bucket}_{entity_qid}_*.json"
    candidate_paths = sorted(CACHE_DIR.glob(cache_pattern), key=lambda path: path.stat().st_mtime, reverse=True)
    for candidate_path in candidate_paths:
        candidate_rows = load_json_cache(candidate_path)
        if candidate_rows is None:
            continue
        if len(candidate_rows) >= limit or allow_undersized_fallback:
            log(f"Using fallback cached SPARQL results for {bucket} from {candidate_path.name}.")
            return candidate_rows[:limit], True

    return None, False


def enrich_rows_with_metadata(bucket: str, entity_qid: str, rows: List[Dict]) -> List[Dict]:
    item_ids = [row["wikidata_id"] for row in rows if row.get("wikidata_id")]
    metadata_by_item = fetch_entity_metadata(bucket, entity_qid, item_ids) if item_ids else {}

    enriched_rows = []
    for row in rows:
        metadata = metadata_by_item.get(row["wikidata_id"], {})
        enriched_row = dict(row)
        enriched_row.update(
            {
                "aliases": metadata.get("aliases", []),
                "instance_of": metadata.get("instance_of", []),
                "subclass_path": metadata.get("subclass_path", []),
                "country": metadata.get("country", ""),
                "relevance_start": metadata.get("relevance_start", ""),
                "relevance_end": metadata.get("relevance_end", ""),
                "occupations": metadata.get("occupations", []),
                "genres": metadata.get("genres", []),
                "franchise_or_series": metadata.get("franchise_or_series", []),
                "gender": metadata.get("gender", ""),
                "notable_for": metadata.get("notable_for", []),
            }
        )
        enriched_rows.append(enriched_row)

    return enriched_rows


def metadata_query_for(item_ids: List[str]) -> str:
    item_values = " ".join("wd:{0}".format(item_id) for item_id in item_ids if item_id)
    return METADATA_SPARQL_TEMPLATE.format(item_values=item_values)


def fetch_entity_metadata(bucket: str, entity_qid: str, item_ids: List[str]) -> Dict[str, Dict[str, str]]:
    cache_path = metadata_cache_path(bucket, entity_qid, item_ids)
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
        instance_of = split_grouped_values(get_binding_value(row, "instanceOf"), limit=8)
        metadata_by_item[item_id] = {
            "aliases": split_grouped_values(get_binding_value(row, "aliases"), limit=12),
            "instance_of": instance_of,
            "subclass_path": filter_subclass_path(
                split_grouped_values(
                    get_binding_value(row, "subclassPath"),
                    exclude=instance_of,
                    limit=24,
                )
            ),
            "occupations": split_grouped_values(get_binding_value(row, "occupations"), limit=8),
            "genres": split_grouped_values(get_binding_value(row, "genres"), limit=8),
            "franchise_or_series": split_grouped_values(get_binding_value(row, "franchiseOrSeries"), limit=8),
            "gender": first_grouped_value(get_binding_value(row, "genders")),
            "notable_for": split_grouped_values(get_binding_value(row, "notableFor"), limit=8),
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
            stale_rows, stale_from_cache = load_bucket_cache(
                bucket,
                entity_qid,
                limit,
                allow_undersized_fallback=True,
            )
            if stale_rows is not None:
                log(f"Using stale cached SPARQL results for {bucket} after WDQS failure.")
                rows = stale_rows
                from_cache = stale_from_cache
            else:
                from_cache = False

    results = []
    for row in rows:
        item_url = get_binding_value(row, "item")
        item_id = get_wikidata_id(item_url)
        label = get_binding_value(row, "itemLabel")
        description = get_binding_value(row, "itemDescription")
        enwiki_title = get_binding_value(row, "enwikiTitle")

        results.append(
            {
                "wikidata_id": item_id,
                "title": label,
                "raw_description": description,
                "enwiki_title": enwiki_title,
            }
        )

    return results, from_cache


def balanced_limit(cards: List[Dict], max_rows: int) -> List[Dict]:
    if max_rows <= 0 or not cards:
        return []

    bucket_order = list(ENTITY_TYPES.keys())
    grouped_cards = {bucket: [] for bucket in bucket_order}
    for card in cards:
        grouped_cards.setdefault(card["bucket"], []).append(card)

    selected = []
    selected_ids = set()
    base_quota = max_rows // len(bucket_order)
    remainder = max_rows % len(bucket_order)

    for index, bucket in enumerate(bucket_order):
        bucket_cards = grouped_cards.get(bucket, [])
        target = base_quota + (1 if index < remainder else 0)
        for card in bucket_cards[:target]:
            card_id = card["wikidata_id"]
            if card_id in selected_ids:
                continue
            selected.append(card)
            selected_ids.add(card_id)

    if len(selected) >= max_rows:
        return selected[:max_rows]

    for card in cards:
        card_id = card["wikidata_id"]
        if card_id in selected_ids:
            continue
        selected.append(card)
        selected_ids.add(card_id)
        if len(selected) >= max_rows:
            break

    return selected[:max_rows]


def collect_card_candidates(
    per_type_limit: int = 150,
    include_pageviews: bool = True,
    max_rows: Optional[int] = None,
    min_pageviews_365d: Optional[int] = None,
) -> List[Dict]:
    all_cards = []
    pageview_days = 365
    trend_days = 30
    bucket_items = list(ENTITY_TYPES.items())
    total_buckets = len(bucket_items)
    pageview_cache = load_pageviews_cache(pageview_days) if include_pageviews else {}
    trend_cache = load_pageviews_cache(trend_days) if include_pageviews else {}
    pageview_cache_dirty = False
    trend_cache_dirty = False

    for bucket_index, (bucket, qid) in enumerate(bucket_items):
        bucket_limit = per_type_limit
        if max_rows is not None:
            remaining_rows = max_rows - len(all_cards)
            remaining_buckets = total_buckets - bucket_index
            if remaining_rows <= 0:
                break
            bucket_target = max(1, (remaining_rows + remaining_buckets - 1) // remaining_buckets)
            bucket_fetch_multiplier = THRESHOLD_BUCKET_FETCH_MULTIPLIER if min_pageviews_365d is not None else 1
            bucket_limit = min(
                per_type_limit,
                (bucket_target * bucket_fetch_multiplier) + 1,
            )

        log(f"Fetching {bucket}...")
        try:
            rows, from_cache = fetch_entities(bucket, qid, bucket_limit)
        except RequestError as exc:
            log(f"Skipping bucket {bucket} due to SPARQL fetch error: {exc}")
            continue

        if not from_cache:
            time.sleep(SPARQL_BUCKET_SLEEP_SECONDS)

        rows_with_titles = [row for row in rows if row["title"].strip()]
        yearly_titles = [row["enwiki_title"].strip() for row in rows_with_titles if row["enwiki_title"].strip()]
        yearly_pageviews, batch_dirty = resolve_pageviews_batch(yearly_titles, pageview_days, pageview_cache) if include_pageviews else ({}, False)
        pageview_cache_dirty = pageview_cache_dirty or batch_dirty

        surviving_rows = []
        for row in rows:
            title = row["title"].strip()
            if not title:
                continue

            enwiki_title = row["enwiki_title"].strip()
            views_365d = yearly_pageviews.get(enwiki_title, 0) if include_pageviews and enwiki_title else 0

            if min_pageviews_365d is not None and views_365d < min_pageviews_365d:
                log(
                    "Skipped low-pageview card (< {0}): [{1}] {2} ({3})".format(
                        min_pageviews_365d,
                        bucket,
                        title,
                        views_365d,
                    )
                )
                continue

            surviving_row = dict(row)
            surviving_row["pageviews_365d"] = views_365d
            surviving_rows.append(surviving_row)

        if not surviving_rows:
            continue

        surviving_rows = enrich_rows_with_metadata(bucket, qid, surviving_rows)
        trend_titles = [row["enwiki_title"].strip() for row in surviving_rows if row["enwiki_title"].strip()]
        trend_pageviews, trend_dirty = resolve_pageviews_batch(trend_titles, trend_days, trend_cache) if include_pageviews else ({}, False)
        trend_cache_dirty = trend_cache_dirty or trend_dirty

        for row in surviving_rows:
            title = row["title"].strip()
            enwiki_title = row["enwiki_title"].strip()
            aliases = row["aliases"]
            occupations = row["occupations"]
            genres = row["genres"]
            notable_for = row["notable_for"]
            views_365d = row["pageviews_365d"]
            views_30d = trend_pageviews.get(enwiki_title, 0) if include_pageviews and enwiki_title else 0

            if bucket == "human":
                genres = []
                if not notable_for and enwiki_title:
                    try:
                        lead_data = fetch_wikipedia_lead_data(enwiki_title)
                        notable_for = derive_notable_for_from_lead(
                            title=title,
                            aliases=aliases,
                            lead_extract=str(lead_data.get("extract", "")),
                            lead_links=lead_data.get("links", []),
                        )
                    except Exception as exc:
                        log(f"Wikipedia lead fallback failed for {enwiki_title}: {exc}")

            card = {
                "wikidata_id": row["wikidata_id"],
                "title": title,
                "description": build_description(
                    name=title,
                    raw_description=row["raw_description"],
                    occupations=occupations,
                    bucket=bucket,
                    notable_for=notable_for,
                ),
                "bucket": bucket,
                "enwiki_title": enwiki_title,
                "aliases": aliases,
                "instance_of": row["instance_of"],
                "subclass_path": row["subclass_path"],
                "occupations": occupations,
                "genres": genres,
                "franchise_or_series": row["franchise_or_series"],
                "gender": row["gender"],
                "notable_for": notable_for,
                "country": row["country"],
                "relevance_start": row["relevance_start"],
                "relevance_end": row["relevance_end"],
                "pageviews_30d": views_30d,
                "pageviews_365d": views_365d,
                "pageviews_trend": compute_pageviews_trend(views_30d, views_365d),
                "points": difficulty_from_pageviews(views_365d) if enwiki_title else 4,
            }
            all_cards.append(card)
            target_label = str(max_rows) if max_rows is not None else "all"
            log("Collected raw card {0}/{1}: [{2}] {3}".format(len(all_cards), target_label, bucket, title))

    if include_pageviews and pageview_cache_dirty:
        save_pageviews_cache(pageview_days, pageview_cache)
    if include_pageviews and trend_cache_dirty:
        save_pageviews_cache(trend_days, trend_cache)

    # Deduplicate by title, keeping the version with the highest pageviews.
    deduped = {}
    for card in all_cards:
        key = card["title"].strip().lower()
        existing = deduped.get(key)
        if existing is None or card["pageviews_365d"] > existing["pageviews_365d"]:
            deduped[key] = card

    result = list(deduped.values())
    result.sort(key=lambda x: (x["points"], -x["pageviews_365d"], x["title"]))
    if max_rows is not None:
        return balanced_limit(result, max_rows)
    return result


def save_cards_json(cards: List[Dict], path: Path = OUTPUT_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    try:
        cards = collect_card_candidates(
            per_type_limit=RAW_CANDIDATE_LIMIT,
            include_pageviews=True,
            max_rows=TEST_ROW_LIMIT,
            min_pageviews_365d=MIN_PAGEVIEWS_365D,
        )
        save_cards_json(cards, OUTPUT_PATH)
        rows_with_pageviews = sum(1 for card in cards if card["pageviews_365d"] > 0)
        log(f"Fetched {len(cards)} cards for testing.")
        log(f"Attached pageviews to {rows_with_pageviews} rows.")
        log(f"Wrote cards to {OUTPUT_PATH}.")
    except KeyboardInterrupt:
        log("Cancelled.")
