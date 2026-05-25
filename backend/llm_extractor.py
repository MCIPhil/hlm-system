import os
import re
import json
import time
from pathlib import Path
from collections import defaultdict, Counter
from typing import Dict, List, Any

from dotenv import load_dotenv
from openai import OpenAI


# =========================================================
# 1. 基础配置
# =========================================================

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DEFAULT_ALIAS_PATH = BASE_DIR / "data" / "characters.json"

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

# 每段最大字符数，避免单段过长
MAX_CHARS_PER_CHUNK = int(os.getenv("MAX_CHARS_PER_CHUNK", "1200"))

# 实际发送给模型的上下文最大字符数
MAX_CONTEXT_CHARS = int(os.getenv("MAX_CONTEXT_CHARS", "700"))

# 每条边最多保留多少条证据
MAX_EVIDENCE_PER_EDGE = int(os.getenv("MAX_EVIDENCE_PER_EDGE", "8"))

# 大模型最多调用次数，0 表示不限
MAX_LLM_CALLS = int(os.getenv("MAX_LLM_CALLS", "0"))

# 每次调用之间暂停秒数
REQUEST_INTERVAL_SEC = float(os.getenv("LLM_REQUEST_INTERVAL_SEC", "0.0"))

# 调用失败后的最大重试次数
MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "3"))

# JSON 输出最大 token 数
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "600"))

# 置信度达到该阈值时额外加权
CONFIDENCE_BONUS_THRESHOLD = float(
    os.getenv("CONFIDENCE_BONUS_THRESHOLD", "0.8")
)

# 遇到这些错误后立即终止，不再继续重试
FATAL_ERROR_KEYWORDS = [
    "402",
    "Insufficient Balance",
    "401",
    "Authentication Fails",
    "invalid api key",
    "Incorrect API key",
    "Unauthorized"
]


# =========================================================
# 2. 关系权重配置
# =========================================================

RELATION_TYPE_WEIGHT = {
    "亲属关系": 3,
    "婚姻关系": 3,
    "主仆关系": 2,
    "情感关系": 2,
    "权力关系": 2,
    "冲突关系": 1,
    "朋友关系": 1,
    "普通共现": 0
}

VALID_RELATION_TYPES = set(RELATION_TYPE_WEIGHT.keys())


# =========================================================
# 3. 内置人物别名表
#    如果 data/characters.json 存在，则优先使用外部文件
# =========================================================

FALLBACK_ALIAS_MAP = {
    "贾宝玉": ["贾宝玉", "宝玉", "宝二爷", "怡红公子"],
    "林黛玉": ["林黛玉", "黛玉", "林姑娘", "颦儿"],
    "薛宝钗": ["薛宝钗", "宝钗", "宝姐姐", "薛姑娘"],
    "王熙凤": ["王熙凤", "凤姐", "凤辣子", "琏二奶奶"],
    "贾母": ["贾母", "老太太", "老祖宗"],
    "贾政": ["贾政", "政老爷"],
    "王夫人": ["王夫人", "二太太"],
    "贾琏": ["贾琏", "琏二爷"],
    "袭人": ["袭人", "花袭人"],
    "晴雯": ["晴雯"],
    "紫鹃": ["紫鹃"],
    "平儿": ["平儿"],
    "鸳鸯": ["鸳鸯"],
    "史湘云": ["史湘云", "湘云"],
    "探春": ["探春", "三姑娘"],
    "迎春": ["迎春", "二姑娘"],
    "惜春": ["惜春", "四姑娘"],
    "李纨": ["李纨", "珠大奶奶"],
    "薛蟠": ["薛蟠"],
    "香菱": ["香菱"],
    "刘姥姥": ["刘姥姥"],
    "秦可卿": ["秦可卿", "可卿"],
    "贾珍": ["贾珍", "珍大爷"],
    "贾蓉": ["贾蓉"]
}


# =========================================================
# 4. DeepSeek 客户端
# =========================================================

_client = None


def get_client() -> OpenAI:
    """
    懒加载 DeepSeek 客户端。
    """
    global _client

    if _client is not None:
        return _client

    if not DEEPSEEK_API_KEY:
        raise RuntimeError(
            "未检测到 DEEPSEEK_API_KEY，请在 backend/.env 中配置。"
        )

    _client = OpenAI(
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL
    )

    return _client


# =========================================================
# 5. 人物别名表读取与归一
# =========================================================

def load_alias_map(alias_path: Path = DEFAULT_ALIAS_PATH) -> Dict[str, List[str]]:
    """
    优先读取 data/characters.json。
    如果不存在或格式有误，则使用内置别名表。
    """
    if alias_path.exists():
        try:
            with open(alias_path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)

            if isinstance(raw_data, dict):
                return normalize_alias_map(raw_data)

        except Exception as e:
            print(f"[警告] characters.json 读取失败，使用内置别名表。原因：{e}")

    return normalize_alias_map(FALLBACK_ALIAS_MAP)


def normalize_alias_map(raw_map: Dict[str, List[str]]) -> Dict[str, List[str]]:
    """
    确保：
    1. 标准名本身也进入 alias 列表；
    2. 去重；
    3. 去除空字符串。
    """
    normalized = {}

    for canonical_name, aliases in raw_map.items():
        if not canonical_name:
            continue

        canonical_name = str(canonical_name).strip()
        alias_set = {canonical_name}

        if isinstance(aliases, list):
            for alias in aliases:
                alias = str(alias).strip()
                if alias:
                    alias_set.add(alias)

        normalized[canonical_name] = sorted(
            alias_set,
            key=lambda x: len(x),
            reverse=True
        )

    return normalized


def build_reverse_alias_map(alias_map: Dict[str, List[str]]) -> Dict[str, str]:
    """
    构建 别名 -> 标准名 的反向映射。
    """
    reverse_map = {}

    for canonical_name, aliases in alias_map.items():
        reverse_map[canonical_name] = canonical_name

        for alias in aliases:
            reverse_map[alias] = canonical_name

    return reverse_map


def canonicalize_name(
    name: str,
    reverse_alias_map: Dict[str, str]
) -> str:
    """
    将人物名或别名转成标准名。
    """
    name = str(name).strip()
    return reverse_alias_map.get(name, name)


# =========================================================
# 6. 文本读取与切分
# =========================================================

def read_text_file(txt_path: str) -> str:
    """
    尝试使用多种编码读取 txt。
    """
    encodings = ["utf-8", "utf-8-sig", "gb18030"]
    last_error = None

    for encoding in encodings:
        try:
            with open(txt_path, "r", encoding=encoding) as f:
                return f.read()
        except Exception as e:
            last_error = e

    raise RuntimeError(f"文本文件读取失败：{last_error}")


def split_text_into_paragraphs(text: str) -> List[str]:
    """
    先按换行切段，再对过长段落继续拆分。
    """
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    raw_paragraphs = [
        p.strip()
        for p in re.split(r"\n+", text)
        if p.strip()
    ]

    final_chunks = []

    for paragraph in raw_paragraphs:
        if len(paragraph) < 20:
            continue

        chunks = split_long_paragraph(paragraph, MAX_CHARS_PER_CHUNK)
        final_chunks.extend(chunks)

    return final_chunks


def split_long_paragraph(paragraph: str, max_chars: int) -> List[str]:
    """
    如果段落过长，则优先按中文标点切分。
    """
    if len(paragraph) <= max_chars:
        return [paragraph]

    sentences = re.split(r"(?<=[。！？；])", paragraph)

    chunks = []
    current_chunk = ""

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        if len(current_chunk) + len(sentence) <= max_chars:
            current_chunk += sentence
        else:
            if current_chunk:
                chunks.append(current_chunk)

            if len(sentence) <= max_chars:
                current_chunk = sentence
            else:
                for i in range(0, len(sentence), max_chars):
                    chunks.append(sentence[i:i + max_chars])
                current_chunk = ""

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


# =========================================================
# 7. 候选人物筛选
# =========================================================

def extract_candidate_characters(
    paragraph: str,
    alias_map: Dict[str, List[str]]
) -> List[str]:
    """
    找出当前段落中出现过的标准人物名。
    """
    candidates = []

    for canonical_name, aliases in alias_map.items():
        for alias in aliases:
            if alias and alias in paragraph:
                candidates.append(canonical_name)
                break

    return sorted(set(candidates))


def compact_paragraph_for_llm(
    paragraph: str,
    candidate_characters: List[str],
    alias_map: Dict[str, List[str]]
) -> str:
    """
    只保留与候选人物相关的句子，并保留前后邻近句，
    用于减少发送给模型的 token。
    """
    sentences = re.split(r"(?<=[。！？；])", paragraph)

    all_aliases = []
    for name in candidate_characters:
        all_aliases.extend(alias_map.get(name, [name]))

    selected_indices = set()

    for i, sentence in enumerate(sentences):
        if any(alias in sentence for alias in all_aliases):
            selected_indices.add(i)

            if i - 1 >= 0:
                selected_indices.add(i - 1)

            if i + 1 < len(sentences):
                selected_indices.add(i + 1)

    compact_text = "".join(
        sentences[i].strip()
        for i in sorted(selected_indices)
        if sentences[i].strip()
    )

    if not compact_text:
        compact_text = paragraph

    return compact_text[:MAX_CONTEXT_CHARS]


# =========================================================
# 8. Prompt 构建
# =========================================================

def build_prompt(
    paragraph: str,
    candidate_characters: List[str],
    alias_map: Dict[str, List[str]]
) -> str:
    """
    精简版 Prompt，降低输入 token。
    """
    compact_text = compact_paragraph_for_llm(
        paragraph=paragraph,
        candidate_characters=candidate_characters,
        alias_map=alias_map
    )

    candidate_desc = "; ".join(
        f"{name}={'/'.join(alias_map.get(name, [name]))}"
        for name in candidate_characters
    )

    prompt = f"""
抽取《红楼梦》片段中的人物关系，输出json。

规则：
1. s、t只能用候选人物标准名。
2. r只能取：
亲属关系、婚姻关系、主仆关系、情感关系、权力关系、冲突关系、朋友关系、普通共现。
3. 只输出有依据的关系；无关系返回 {{"relations":[]}}。
4. c为置信度，0到1。
5. e为证据，尽量不超过40字。

候选人物：
{candidate_desc}

格式：
{{"relations":[{{"s":"贾宝玉","t":"林黛玉","r":"情感关系","c":0.9,"e":"证据"}}]}}

文本：
{compact_text}
""".strip()

    return prompt


# =========================================================
# 9. JSON 解析
# =========================================================

def safe_json_loads(content: str) -> Dict[str, Any]:
    """
    尝试解析模型返回的 JSON。
    即便模型意外包了 ```json 代码块，也尽量兼容。
    """
    if not content:
        return {"relations": []}

    content = content.strip()

    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?", "", content).strip()
        content = re.sub(r"```$", "", content).strip()

    try:
        result = json.loads(content)
        if isinstance(result, dict):
            return result
    except Exception:
        pass

    start = content.find("{")
    end = content.rfind("}")

    if start != -1 and end != -1 and end > start:
        try:
            result = json.loads(content[start:end + 1])
            if isinstance(result, dict):
                return result
        except Exception:
            pass

    return {"relations": []}


# =========================================================
# 10. 错误判断
# =========================================================

def is_fatal_llm_error(error_text: str) -> bool:
    """
    判断是否属于不应重试的致命错误。
    """
    error_text_lower = error_text.lower()

    return any(
        keyword.lower() in error_text_lower
        for keyword in FATAL_ERROR_KEYWORDS
    )


# =========================================================
# 11. 调用 DeepSeek 抽取关系
# =========================================================

def call_llm_extract_relations(
    paragraph: str,
    candidate_characters: List[str],
    alias_map: Dict[str, List[str]]
) -> List[Dict[str, Any]]:
    """
    调用 DeepSeek API，返回关系列表。
    遇到余额不足或鉴权错误时立即终止。
    """
    prompt = build_prompt(
        paragraph=paragraph,
        candidate_characters=candidate_characters,
        alias_map=alias_map
    )

    client = get_client()

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.chat.completions.create(
                model=DEEPSEEK_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "只输出合法json。"
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=LLM_MAX_TOKENS,
                stream=False
            )

            content = response.choices[0].message.content or ""
            result = safe_json_loads(content)

            relations = result.get("relations", [])

            if isinstance(relations, list):
                return relations

            return []

        except Exception as e:
            error_text = str(e)

            if is_fatal_llm_error(error_text):
                raise RuntimeError(
                    f"DeepSeek API 调用终止：{error_text}"
                )

            print(f"[警告] 第 {attempt} 次调用大模型失败：{e}")

            if attempt < MAX_RETRIES:
                time.sleep(1.5 * attempt)

    return []


# =========================================================
# 12. 关系标准化与验证
# =========================================================

def normalize_relation_item(
    item: Dict[str, Any],
    reverse_alias_map: Dict[str, str],
    valid_characters: set
) -> Dict[str, Any]:
    """
    清洗并标准化单条关系。
    同时兼容短字段和旧字段：
    s/source
    t/target
    r/relation
    c/confidence
    e/evidence
    """
    if not isinstance(item, dict):
        return {}

    source_raw = item.get("s", item.get("source", ""))
    target_raw = item.get("t", item.get("target", ""))
    relation_raw = item.get("r", item.get("relation", "普通共现"))
    confidence_raw = item.get("c", item.get("confidence", 0.5))
    evidence_raw = item.get("e", item.get("evidence", ""))

    source = canonicalize_name(
        source_raw,
        reverse_alias_map
    )

    target = canonicalize_name(
        target_raw,
        reverse_alias_map
    )

    relation = str(relation_raw).strip()
    evidence = str(evidence_raw).strip()

    try:
        confidence = float(confidence_raw)
    except Exception:
        confidence = 0.5

    confidence = max(0.0, min(confidence, 1.0))

    if relation not in VALID_RELATION_TYPES:
        relation = "普通共现"

    if not source or not target:
        return {}

    if source == target:
        return {}

    if source not in valid_characters or target not in valid_characters:
        return {}

    return {
        "source": source,
        "target": target,
        "relation": relation,
        "confidence": confidence,
        "evidence": evidence
    }


# =========================================================
# 13. 边权重计算
# =========================================================

def compute_increment_weight(relation: str, confidence: float) -> float:
    """
    单次关系抽取得到的加权分数。
    """
    weight = 1.0

    weight += RELATION_TYPE_WEIGHT.get(relation, 0)

    if confidence >= CONFIDENCE_BONUS_THRESHOLD:
        weight += 1.0

    return weight


def create_edge_bucket() -> Dict[str, Any]:
    """
    用于 relation_map 的默认结构。
    """
    return {
        "relation_counter": Counter(),
        "weight": 0.0,
        "evidence": [],
        "evidence_set": set()
    }


def choose_main_relation(relation_counter: Counter) -> str:
    """
    选择同一对人物之间最主要的关系类型。
    """
    if not relation_counter:
        return "普通共现"

    relation, _ = max(
        relation_counter.items(),
        key=lambda item: (
            item[1],
            RELATION_TYPE_WEIGHT.get(item[0], 0)
        )
    )

    return relation


# =========================================================
# 14. 主分析流程
# =========================================================

def analyze_text_file(txt_path: str, graph_path: str) -> Dict[str, Any]:
    """
    主入口：
    1. 读取 txt；
    2. 段落切分；
    3. 人物候选筛选；
    4. 调用大模型抽取关系；
    5. 合并边；
    6. 保存 graph.json。
    """
    alias_map = load_alias_map()
    reverse_alias_map = build_reverse_alias_map(alias_map)
    valid_characters = set(alias_map.keys())

    text = read_text_file(txt_path)
    paragraphs = split_text_into_paragraphs(text)

    relation_map = defaultdict(create_edge_bucket)

    total_paragraphs = len(paragraphs)
    used_paragraphs = 0
    llm_call_count = 0
    extracted_relation_count = 0

    for index, paragraph in enumerate(paragraphs, start=1):
        candidate_characters = extract_candidate_characters(
            paragraph,
            alias_map
        )

        # 少于 2 人，不调用模型
        if len(candidate_characters) < 2:
            continue

        # 调试阶段限制调用次数
        if MAX_LLM_CALLS > 0 and llm_call_count >= MAX_LLM_CALLS:
            print(f"[提示] 已达到 MAX_LLM_CALLS={MAX_LLM_CALLS}，停止继续调用。")
            break

        used_paragraphs += 1
        llm_call_count += 1

        print(
            f"[进度] 分析段落 {index}/{total_paragraphs}，"
            f"候选人物：{candidate_characters}"
        )

        raw_relations = call_llm_extract_relations(
            paragraph=paragraph,
            candidate_characters=candidate_characters,
            alias_map=alias_map
        )

        for item in raw_relations:
            relation_item = normalize_relation_item(
                item=item,
                reverse_alias_map=reverse_alias_map,
                valid_characters=valid_characters
            )

            if not relation_item:
                continue

            source = relation_item["source"]
            target = relation_item["target"]
            relation = relation_item["relation"]
            confidence = relation_item["confidence"]
            evidence = relation_item["evidence"]

            pair_key = tuple(sorted([source, target]))
            bucket = relation_map[pair_key]

            bucket["relation_counter"][relation] += 1
            bucket["weight"] += compute_increment_weight(
                relation=relation,
                confidence=confidence
            )

            if evidence:
                if (
                    evidence not in bucket["evidence_set"]
                    and len(bucket["evidence"]) < MAX_EVIDENCE_PER_EDGE
                ):
                    bucket["evidence"].append(evidence)
                    bucket["evidence_set"].add(evidence)

            extracted_relation_count += 1

        if REQUEST_INTERVAL_SEC > 0:
            time.sleep(REQUEST_INTERVAL_SEC)

    # =====================================================
    # 15. 生成 graph.json
    # =====================================================

    links = []
    node_weight_map = defaultdict(float)

    for (source, target), info in relation_map.items():
        weight = max(round(info["weight"], 4), 1.0)
        cost = round(1 / weight, 8)

        main_relation = choose_main_relation(
            info["relation_counter"]
        )

        links.append({
            "source": source,
            "target": target,
            "relation": main_relation,
            "weight": weight,
            "cost": cost,
            "evidence": info["evidence"]
        })

        node_weight_map[source] += weight
        node_weight_map[target] += weight

    links.sort(
        key=lambda item: item["weight"],
        reverse=True
    )

    nodes = []

    for name, total_weight in sorted(
        node_weight_map.items(),
        key=lambda item: item[1],
        reverse=True
    ):
        nodes.append({
            "id": name,
            "name": name,
            "value": round(total_weight, 4)
        })

    graph_data = {
        "nodes": nodes,
        "links": links,
        "meta": {
            "total_paragraphs": total_paragraphs,
            "used_paragraphs": used_paragraphs,
            "llm_call_count": llm_call_count,
            "extracted_relation_count": extracted_relation_count,
            "node_count": len(nodes),
            "edge_count": len(links),
            "model": DEEPSEEK_MODEL
        }
    }

    graph_path_obj = Path(graph_path)
    graph_path_obj.parent.mkdir(parents=True, exist_ok=True)

    with open(graph_path_obj, "w", encoding="utf-8") as f:
        json.dump(
            graph_data,
            f,
            ensure_ascii=False,
            indent=2
        )

    return {
        "node_count": len(nodes),
        "edge_count": len(links),
        "llm_call_count": llm_call_count,
        "used_paragraphs": used_paragraphs,
        "extracted_relation_count": extracted_relation_count
    }