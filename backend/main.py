from pathlib import Path
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from graph_service import find_shortest_path, load_graph
from llm_extractor import analyze_text_file


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GRAPH_PATH = BASE_DIR / "data" / "graph.json"
UPLOAD_PATH = BASE_DIR / "uploads" / "hongloumeng.txt"


class PathRequest(BaseModel):
    source: str
    target: str


@app.get("/api/health")
def health_check():
    return {
        "success": True,
        "message": "backend is running",
        "graph_exists": GRAPH_PATH.exists(),
    }


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    os.makedirs(UPLOAD_PATH.parent, exist_ok=True)
    os.makedirs(GRAPH_PATH.parent, exist_ok=True)

    content = await file.read()
    with open(UPLOAD_PATH, "wb") as f:
        f.write(content)

    try:
        result = analyze_text_file(str(UPLOAD_PATH), str(GRAPH_PATH))
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": f"分析失败：{exc}",
            },
        )

    return {
        "success": True,
        "node_count": result["node_count"],
        "edge_count": result["edge_count"],
        "message": "分析完成",
    }


@app.get("/api/graph")
def get_graph():
    if not GRAPH_PATH.exists():
        return {
            "success": False,
            "message": "图谱不存在，请先上传并分析文本。",
            "nodes": [],
            "links": [],
        }

    with open(GRAPH_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@app.post("/api/path")
def query_path(req: PathRequest):
    if not GRAPH_PATH.exists():
        return {
            "success": False,
            "message": "图谱不存在，请先上传并分析文本。",
        }

    graph_data = load_graph(str(GRAPH_PATH))
    result = find_shortest_path(graph_data, req.source, req.target)
    return result
