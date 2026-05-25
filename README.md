# 《红楼梦》人物关系图谱分析系统


Copyright © 2026 MCIPhil ，Human-Intelligence-CN.
All rights reserved.

This repository, including all code, documentation, and related materials (collectively "the Work"), is private and protected by copyright law and international treaties.

Unauthorized use, copying, modification, distribution, or creation of derivative works from this Work is strictly prohibited. No part of the Work may be reproduced, transmitted, or utilized in any form without explicit written permission from the copyright owner.

For permission requests, contact: zqcllwldd@126.com


本项目是一个用于分析《红楼梦》文本中人物关系的可视化系统。系统通过调用 DeepSeek 大模型从小说文本中抽取人物关系，生成关系图谱数据，并在前端页面中进行图谱展示、关系筛选和人物最短路径查询。

本项目实际应用于我辅修的人工智能微专业，这是我最认真做的一次了，调api还花我三块大洋！！！

## 功能特性

- 上传《红楼梦》`.txt` 文本文件
- 自动识别文本片段中的候选人物
- 调用 DeepSeek API 抽取人物之间的关系
- 生成人物关系图谱 `graph.json`
- 使用 ECharts 展示人物关系网络
- 支持关系强度筛选、显示人物数量控制、布局切换、标签开关
- 支持点击节点或边查看详情与证据片段
- 支持查询任意两个人物之间的最短路径

## 项目结构

```text
hlmsystem/
├─ backend/                         后端服务目录
│  ├─ main.py                       FastAPI 入口，提供 API 接口
│  ├─ llm_extractor.py              调用 DeepSeek，抽取人物关系
│  ├─ graph_service.py              图谱读取与最短路径计算
│  ├─ requirements.txt              后端依赖列表
│  ├─ .env                          本地环境变量配置，需自行创建或修改
│  ├─ data/
│  │  └─ graph.json                 分析后生成的人物关系图谱数据
│  ├─ upload/
│  │  └─ 《红楼梦》.txt             示例或原始文本文件
│  ├─ uploads/
│  │  └─ hongloumeng.txt            前端上传后保存的文本文件
│  └─ __pycache__/                  Python 缓存文件，提交 GitHub 时可忽略
│
├─ frontend/                        前端页面目录
│  ├─ index.html                    页面结构
│  ├─ app.js                        前端交互、接口请求、图谱渲染
│  └─ style.css                     页面样式
│
└─ README.md
```

## 技术栈

后端：

- Python 3.12
- FastAPI
- Uvicorn
- OpenAI Python SDK
- NetworkX
- python-dotenv
- python-multipart

前端：

- HTML
- CSS
- JavaScript
- ECharts

大模型服务：

- DeepSeek API

## 环境准备

### 1. 创建或进入 Python 环境

推荐使用 Conda 虚拟环境。示例：

```powershell
conda create -n math python=3.12
conda activate math
```

如果已经创建好环境，直接激活即可：

```powershell
conda activate math
```

### 2. 安装后端依赖

进入项目后端目录：

```powershell
cd ..\hlmsystem\backend
```

安装依赖：

```powershell
pip install -r requirements.txt
```

`requirements.txt` 内容如下：

```text
fastapi
uvicorn
python-multipart
networkx
openai
python-dotenv
```

## 配置 DeepSeek API

在 `backend` 目录下创建或修改 `.env` 文件：

```env
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com

MAX_CHARS_PER_CHUNK=1200
MAX_CONTEXT_CHARS=700
LLM_MAX_TOKENS=600
LLM_MAX_RETRIES=3

MAX_LLM_CALLS=200
LLM_REQUEST_INTERVAL_SEC=0.2
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `DEEPSEEK_MODEL` | 使用的大模型名称 |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址 |
| `MAX_CHARS_PER_CHUNK` | 每个文本片段最大字符数 |
| `MAX_CONTEXT_CHARS` | 实际发送给模型的上下文最大字符数 |
| `LLM_MAX_TOKENS` | 模型单次最大输出 token 数 |
| `LLM_MAX_RETRIES` | 单次调用失败后的最大重试次数 |
| `MAX_LLM_CALLS` | 最大模型调用次数，`0` 表示不限制 |
| `LLM_REQUEST_INTERVAL_SEC` | 每次模型调用之间的等待时间 |

开发测试建议：

```env
MAX_LLM_CALLS=20
```

较完整分析建议：

```env
MAX_LLM_CALLS=200
```

全量分析：

```env
MAX_LLM_CALLS=0
```

全量分析大约会触发数千次 API 调用，耗时和费用会明显增加。

## 运行后端服务

进入后端目录：

```powershell
cd ..\hlmsystem\backend
```

启动 FastAPI 服务：

```powershell
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

看到以下输出表示后端启动成功：

```text
Uvicorn running on http://127.0.0.1:8000
```

可以在浏览器中访问健康检查接口：

```text
http://127.0.0.1:8000/api/health
```

正常返回示例：

```json
{
  "success": true,
  "message": "backend is running",
  "graph_exists": true
}
```

## 运行前端页面

前端是静态页面，可以直接用浏览器打开：

```text
..\frontend\index.html
```

也可以在 `frontend` 目录下启动一个简单的静态服务器：

```powershell
cd ..\hlmsystem\frontend
python -m http.server 5500 --bind 127.0.0.1
```

然后访问：

```text
http://127.0.0.1:5500/index.html
```

前端默认请求后端地址：

```text
http://127.0.0.1:8000
http://localhost:8000
```

因此运行前端前，请确保后端服务已经启动。

## 使用流程

1. 启动后端服务。
2. 打开前端页面。
3. 在页面左侧选择《红楼梦》`.txt` 文件。
4. 点击“上传并分析”。
5. 等待 PyCharm 或终端中持续输出分析进度。
6. 分析完成后，点击“重新加载图谱”。
7. 在图谱工具栏中调整关系强度、显示人物数量和布局模式。
8. 点击图谱节点或关系查看详情。
9. 输入起点人物和终点人物，查询人物之间的最短路径。

## API 接口说明

### 健康检查

```http
GET /api/health
```

用于确认后端服务是否正在运行。

### 上传并分析文本

```http
POST /api/analyze
```

请求类型：`multipart/form-data`

字段：

```text
file: txt 文件
```

返回示例：

```json
{
  "success": true,
  "node_count": 24,
  "edge_count": 166,
  "message": "分析完成"
}
```

### 获取图谱数据

```http
GET /api/graph
```

返回 `nodes`、`links` 和 `meta`。

### 查询最短路径

```http
POST /api/path
```

请求体示例：

```json
{
  "source": "贾宝玉",
  "target": "林黛玉"
}
```

返回示例：

```json
{
  "success": true,
  "path": ["贾宝玉", "林黛玉"],
  "edges": [],
  "total_weight": 1215,
  "total_cost": 0.00082305
}
```

## 图谱数据格式

分析完成后会生成：

```text
backend/data/graph.json
```

示例结构：

```json
{
  "nodes": [
    {
      "id": "贾宝玉",
      "name": "贾宝玉",
      "value": 6143.0
    }
  ],
  "links": [
    {
      "source": "贾宝玉",
      "target": "林黛玉",
      "relation": "情感关系",
      "weight": 1215.0,
      "cost": 0.00082305,
      "evidence": [
        "证据片段"
      ]
    }
  ],
  "meta": {
    "total_paragraphs": 6960,
    "used_paragraphs": 3623,
    "llm_call_count": 3623,
    "extracted_relation_count": 3489,
    "node_count": 24,
    "edge_count": 166,
    "model": "deepseek-v4-flash"
  }
}
```

## 常见问题

### 1. 前端提示 `Failed to fetch`

说明前端没有连接到后端。请检查：

- PyCharm 终端中的后端服务是否还在运行
- 后端是否运行在 `127.0.0.1:8000`
- 浏览器能否打开 `http://127.0.0.1:8000/api/health`

### 2. 点击分析后像“没有反应”

分析过程是在后端同步执行的，完整文本会触发大量大模型调用。请查看后端终端是否持续输出：

```text
[进度] 分析段落 108/6960，候选人物：['惜春', '探春', '迎春']
```

只要有类似输出，就说明系统正在分析。

### 3. 图谱太拥挤

可以在前端工具栏中调节：

- 关系强度：过滤弱关系
- 显示人物：只显示核心人物
- 布局：切换“疏朗力导”或“环形”
- 显示标签：关闭后可减少视觉拥挤

### 4. ECharts 无法加载

前端使用 CDN 加载 ECharts：

```html
https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js
```

如果网络无法访问 CDN，页面会自动切换到简易 SVG 图谱视图。若希望完全离线运行，可以下载 ECharts 文件并改为本地引用。

### 5. API Key、余额或鉴权错误

如果后端终端或前端提示：

```text
401
Unauthorized
invalid api key
Insufficient Balance
```

请检查：

- `backend/.env` 中的 `DEEPSEEK_API_KEY` 是否正确
- DeepSeek 账户余额是否充足
- `DEEPSEEK_BASE_URL` 是否为 `https://api.deepseek.com`


## 注意事项

- 全量分析期间请保持电脑不睡眠、网络稳定。
- 如果电脑盒盖进入睡眠，分析任务可能会中断。
- 全量分析会消耗 API 额度，建议先使用较小的 `MAX_LLM_CALLS` 测试。
- 前端页面依赖后端 API，必须先启动后端服务再使用前端。

## 注意事项

- 全量分析期间请保持电脑不睡眠、网络稳定。
- 如果电脑盒盖进入睡眠，分析任务可能会中断。
- 全量分析会消耗 API 额度，建议先使用较小的 `MAX_LLM_CALLS` 测试。
- 前端页面依赖后端 API，必须先启动后端服务再使用前端。

