const API_BASES = [
  "http://127.0.0.1:8000",
  "http://localhost:8000"
];

let chart = null;
let graphData = {
  nodes: [],
  links: []
};

let currentPathNodes = [];
let currentPathEdges = [];

const graphView = {
  minWeight: 0,
  maxNodes: 0,
  layout: "force",
  showLabels: true,
  initialized: false
};


window.addEventListener("DOMContentLoaded", async () => {
  initChart();
  bindGraphControls();
  await loadGraphIfExists();
});


function initChart() {
  const chartDom = document.getElementById("chart");

  if (typeof echarts === "undefined") {
    chart = null;
    chartDom.innerHTML = `
      <div class="fallback-notice">
        ECharts 未加载，已切换到简易图谱视图。
      </div>
    `;
    return;
  }

  chart = echarts.init(chartDom);

  window.addEventListener("resize", () => {
    chart.resize();
    if (!chart) {
      renderFallbackGraph();
    }
  });

  chart.on("click", function (params) {
    if (params.dataType === "node") {
      showNodeDetail(params.data);
    }

    if (params.dataType === "edge") {
      showEdgeDetail(params.data);
    }
  });
}


function bindGraphControls() {
  const minWeightSlider = document.getElementById("minWeightSlider");
  const maxNodesSelect = document.getElementById("maxNodesSelect");
  const layoutSelect = document.getElementById("layoutSelect");
  const labelToggle = document.getElementById("labelToggle");

  if (minWeightSlider) {
    minWeightSlider.addEventListener("input", () => {
      graphView.minWeight = Number(minWeightSlider.value || 0);
      updateControlText();
      renderGraph();
    });
  }

  if (maxNodesSelect) {
    maxNodesSelect.addEventListener("change", () => {
      graphView.maxNodes = Number(maxNodesSelect.value || 0);
      renderGraph();
    });
  }

  if (layoutSelect) {
    layoutSelect.addEventListener("change", () => {
      graphView.layout = layoutSelect.value;
      renderGraph();
    });
  }

  if (labelToggle) {
    labelToggle.addEventListener("change", () => {
      graphView.showLabels = labelToggle.checked;
      renderGraph();
    });
  }
}


function syncGraphControls() {
  const minWeightSlider = document.getElementById("minWeightSlider");
  const maxNodesSelect = document.getElementById("maxNodesSelect");
  const layoutSelect = document.getElementById("layoutSelect");
  const labelToggle = document.getElementById("labelToggle");

  const weights = graphData.links.map(link => Number(link.weight || 0));
  const maxWeight = Math.max(0, ...weights);

  if (!graphView.initialized) {
    graphView.minWeight = getDefaultMinWeight(weights);
    graphView.maxNodes = 0;
    graphView.layout = "force";
    graphView.showLabels = true;
    graphView.initialized = true;
  }

  if (minWeightSlider) {
    minWeightSlider.max = String(Math.ceil(maxWeight));
    minWeightSlider.value = String(graphView.minWeight);
    minWeightSlider.disabled = weights.length === 0;
  }

  if (maxNodesSelect) {
    maxNodesSelect.value = String(graphView.maxNodes);
  }

  if (layoutSelect) {
    layoutSelect.value = graphView.layout;
  }

  if (labelToggle) {
    labelToggle.checked = graphView.showLabels;
  }

  updateControlText();
}


function getDefaultMinWeight(weights) {
  if (!weights.length) {
    return 0;
  }

  const sorted = [...weights].sort((a, b) => a - b);
  const index = Math.floor((sorted.length - 1) * 0.7);
  return Math.max(0, Math.floor(sorted[index]));
}


async function uploadAndAnalyze() {
  const fileInput = document.getElementById("fileInput");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const file = fileInput.files[0];

  if (!file) {
    alert("请先选择 txt 文件");
    return;
  }

  if (!file.name.endsWith(".txt")) {
    alert("请上传 txt 文件");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  analyzeBtn.disabled = true;
  setAnalyzeStatus("正在上传并分析文本，请耐心等待……", "working");

  try {
    const response = await apiFetch("/api/analyze", {
      method: "POST",
      body: formData
    });

    const result = await response.json();

    if (!result.success) {
      setAnalyzeStatus(result.message || "分析失败", "error");
      analyzeBtn.disabled = false;
      return;
    }

    setAnalyzeStatus(
      `分析完成：共生成 ${result.node_count} 个节点，${result.edge_count} 条关系。`,
      "success"
    );

    graphView.initialized = false;
    await loadGraph();

  } catch (error) {
    console.error(error);
    setAnalyzeStatus("请求失败，请检查后端是否已启动。", "error");
  } finally {
    analyzeBtn.disabled = false;
  }
}


function setAnalyzeStatus(message, type = "normal") {
  const statusBox = document.getElementById("analyzeStatus");
  statusBox.textContent = message;
  statusBox.className = `status-box ${type}`;
}


async function loadGraphIfExists() {
  try {
    const response = await apiFetch(`/api/graph?t=${Date.now()}`, {
      cache: "no-store"
    });
    const result = await response.json();

    if (result.success === false) {
      renderEmptyGraph();
      return;
    }

    graphData = result;
    syncGraphControls();
    populateCharacterOptions();
    renderGraph();

  } catch (error) {
    renderEmptyGraph();
  }
}


async function reloadGraph() {
  await loadGraph();
}


async function loadGraph() {
  try {
    const response = await apiFetch(`/api/graph?t=${Date.now()}`, {
      cache: "no-store"
    });
    const result = await response.json();

    if (result.success === false) {
      alert(result.message || "图谱不存在，请先上传并分析文本。");
      return;
    }

    graphData = result;
    syncGraphControls();
    populateCharacterOptions();
    renderGraph();

  } catch (error) {
    console.error(error);
    alert(`图谱加载失败：${error.message || error}`);
  }
}


function renderEmptyGraph() {
  updateGraphStats(0, 0);

  if (!chart) {
    document.getElementById("chart").innerHTML = `
      <div class="fallback-empty">
        <h2>暂无图谱数据</h2>
        <p>请先上传并分析《红楼梦》txt 文件</p>
      </div>
    `;
    return;
  }

  chart.setOption({
    title: {
      text: "暂无图谱数据",
      subtext: "请先上传并分析《红楼梦》txt 文件",
      left: "center",
      top: "center",
      textStyle: {
        fontSize: 24
      },
      subtextStyle: {
        fontSize: 16
      }
    }
  }, true);
}


function renderGraph() {
  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
    renderEmptyGraph();
    return;
  }

  const visibleGraph = buildVisibleGraph();
  updateControlText();
  updateGraphStats(visibleGraph.nodes.length, visibleGraph.links.length);

  if (!chart) {
    renderFallbackGraph(visibleGraph);
    return;
  }

  const maxNodeValue = Math.max(
    ...visibleGraph.nodes.map(node => Number(node.value || 1))
  );
  const maxLinkWeight = Math.max(
    ...visibleGraph.links.map(link => Number(link.weight || 1)),
    1
  );

  const pathNodeSet = new Set(currentPathNodes);
  const pathEdgeSet = new Set(currentPathEdges.map(edgeKey));
  const nodeRankMap = new Map(
    [...visibleGraph.nodes]
      .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
      .map((node, index) => [node.id, index])
  );

  const nodes = visibleGraph.nodes.map(node => {
    const isPathNode = pathNodeSet.has(node.id);
    const nodeValue = Number(node.value || 1);
    const rank = nodeRankMap.get(node.id) || 0;
    const color = getNodeColor(rank, visibleGraph.nodes.length, isPathNode);

    return {
      ...node,
      symbolSize: getNodeSize(nodeValue, maxNodeValue, isPathNode),
      fixed: false,
      itemStyle: {
        color,
        borderColor: isPathNode ? "#a53131" : "rgba(255,255,255,0.95)",
        borderWidth: isPathNode ? 4 : 2,
        shadowBlur: isPathNode ? 18 : 10,
        shadowColor: isPathNode ? "rgba(180,49,49,0.35)" : "rgba(35,55,95,0.18)"
      },
      label: {
        show: shouldShowNodeLabel(node, visibleGraph.nodes.length, isPathNode),
        position: "right",
        distance: 7,
        color: "#20242b",
        fontSize: isPathNode ? 15 : 12,
        fontWeight: isPathNode || rank < 6 ? "700" : "500",
        backgroundColor: "rgba(255,255,255,0.82)",
        borderRadius: 4,
        padding: [2, 4]
      }
    };
  });

  const links = visibleGraph.links.map(link => {
    const key = edgeKey(link);
    const isPathEdge = pathEdgeSet.has(key);
    const weight = Number(link.weight || 1);

    return {
      ...link,
      lineStyle: {
        color: isPathEdge ? "#c83e3e" : getEdgeColor(link.relation),
        width: isPathEdge ? 5 : getScaledEdgeWidth(weight, maxLinkWeight),
        opacity: isPathEdge ? 0.98 : getEdgeOpacity(weight, maxLinkWeight),
        curveness: getEdgeCurveness(link)
      },
      label: {
        show: isPathEdge,
        formatter: function () {
          return link.relation || "关系";
        },
        color: "#8b2140",
        fontSize: 12,
        backgroundColor: "rgba(255,255,255,0.86)",
        borderRadius: 4,
        padding: [2, 5]
      }
    };
  });

  chart.setOption(getChartOption(nodes, links), true);
}


function getChartOption(nodes, links) {
  const isCircular = graphView.layout === "circular";

  return {
    backgroundColor: "#fbfcff",
    title: {
      text: "《红楼梦》人物关系图谱",
      left: 24,
      top: 18,
      textStyle: {
        color: "#20242b",
        fontSize: 22,
        fontWeight: 700
      },
      subtext: "拖拽节点可调整布局，滚轮可缩放",
      subtextStyle: {
        color: "#7c8494",
        fontSize: 12
      }
    },
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: "rgba(28,31,38,0.92)",
      borderColor: "rgba(255,255,255,0.08)",
      textStyle: {
        color: "#fff"
      },
      formatter: function (params) {
        if (params.dataType === "node") {
          return `
            <b>${escapeHtml(params.data.name)}</b><br/>
            节点强度：${formatNumber(params.data.value || 0)}
          `;
        }

        if (params.dataType === "edge") {
          return `
            <b>${escapeHtml(params.data.source)}</b> - <b>${escapeHtml(params.data.target)}</b><br/>
            关系：${escapeHtml(params.data.relation || "普通共现")}<br/>
            权重：${formatNumber(params.data.weight || 0)}<br/>
            代价：${formatNumber(params.data.cost || 0)}
          `;
        }

        return "";
      }
    },
    animationDuration: 900,
    animationDurationUpdate: 700,
    animationEasingUpdate: "cubicOut",
    series: [
      {
        type: "graph",
        layout: graphView.layout,
        roam: true,
        draggable: true,
        data: nodes,
        links,
        circular: {
          rotateLabel: false
        },
        edgeSymbol: ["none", "none"],
        force: {
          repulsion: isCircular ? 220 : 760,
          gravity: isCircular ? 0.02 : 0.045,
          edgeLength: isCircular ? [130, 230] : [180, 440],
          friction: 0.58,
          layoutAnimation: true
        },
        emphasis: {
          focus: "adjacency",
          scale: true,
          lineStyle: {
            width: 5,
            opacity: 1
          },
          label: {
            show: true,
            fontWeight: "700"
          }
        }
      }
    ]
  };
}


function buildVisibleGraph() {
  const allNodes = graphData.nodes || [];
  const allLinks = graphData.links || [];
  const pathNodeSet = new Set(currentPathNodes);
  const pathEdgeSet = new Set(currentPathEdges.map(edgeKey));

  const sortedNodes = [...allNodes].sort(
    (a, b) => Number(b.value || 0) - Number(a.value || 0)
  );

  const selectedNodes = graphView.maxNodes > 0
    ? sortedNodes.slice(0, graphView.maxNodes)
    : sortedNodes;

  const selectedNodeIds = new Set(selectedNodes.map(node => node.id));
  pathNodeSet.forEach(id => selectedNodeIds.add(id));

  const links = allLinks
    .filter(link => {
      const isPathEdge = pathEdgeSet.has(edgeKey(link));
      const weight = Number(link.weight || 0);
      return (
        selectedNodeIds.has(link.source)
        && selectedNodeIds.has(link.target)
        && (isPathEdge || weight >= graphView.minWeight)
      );
    })
    .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));

  const connectedNodeIds = new Set();
  links.forEach(link => {
    connectedNodeIds.add(link.source);
    connectedNodeIds.add(link.target);
  });
  pathNodeSet.forEach(id => connectedNodeIds.add(id));

  const nodes = sortedNodes.filter(node => (
    selectedNodeIds.has(node.id)
    && (connectedNodeIds.has(node.id) || graphView.minWeight === 0)
  ));

  return {
    nodes,
    links
  };
}


function renderFallbackGraph(visibleGraph = buildVisibleGraph()) {
  const chartDom = document.getElementById("chart");
  const width = Math.max(chartDom.clientWidth || 900, 640);
  const height = Math.max(chartDom.clientHeight || 600, 520);
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.36;
  const maxNodeValue = Math.max(
    ...visibleGraph.nodes.map(node => Number(node.value || 1)),
    1
  );
  const maxLinkWeight = Math.max(
    ...visibleGraph.links.map(link => Number(link.weight || 1)),
    1
  );
  const positions = new Map();

  visibleGraph.nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / visibleGraph.nodes.length - Math.PI / 2;
    const nodeRadius = index < 4 ? radius * 0.45 : radius;
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * nodeRadius,
      y: centerY + Math.sin(angle) * nodeRadius
    });
  });

  const pathNodeSet = new Set(currentPathNodes);
  const pathEdgeSet = new Set(currentPathEdges.map(edgeKey));

  const linkSvg = visibleGraph.links.map(link => {
    const source = positions.get(link.source);
    const target = positions.get(link.target);
    if (!source || !target) return "";

    const isPathEdge = pathEdgeSet.has(edgeKey(link));
    const stroke = isPathEdge ? "#c83e3e" : getEdgeColor(link.relation);
    const strokeWidth = isPathEdge
      ? 4
      : getScaledEdgeWidth(Number(link.weight || 1), maxLinkWeight);

    return `
      <line
        x1="${source.x}" y1="${source.y}"
        x2="${target.x}" y2="${target.y}"
        stroke="${stroke}"
        stroke-width="${strokeWidth}"
        opacity="${isPathEdge ? 0.95 : 0.42}"
      />
    `;
  }).join("");

  const nodeSvg = visibleGraph.nodes.map((node, index) => {
    const position = positions.get(node.id);
    const isPathNode = pathNodeSet.has(node.id);
    const size = getNodeSize(Number(node.value || 1), maxNodeValue, isPathNode);
    const color = getNodeColor(index, visibleGraph.nodes.length, isPathNode);
    const escapedName = escapeHtml(node.name || node.id);

    return `
      <g class="fallback-node" data-node-id="${escapeHtml(node.id)}">
        <circle
          cx="${position.x}" cy="${position.y}" r="${size / 2}"
          fill="${color}"
          stroke="rgba(255,255,255,0.95)"
          stroke-width="${isPathNode ? 4 : 2}"
        />
        <text
          x="${position.x}"
          y="${position.y + size / 2 + 18}"
          text-anchor="middle"
          font-size="${isPathNode || index < 8 ? 14 : 12}"
          font-weight="${isPathNode || index < 8 ? "700" : "500"}"
          fill="#20242b"
        >${escapedName}</text>
      </g>
    `;
  }).join("");

  chartDom.innerHTML = `
    <svg class="fallback-svg" viewBox="0 0 ${width} ${height}" role="img">
      <text x="24" y="36" text-anchor="start" font-size="22" font-weight="700" fill="#20242b">
        《红楼梦》人物关系图谱
      </text>
      ${linkSvg}
      ${nodeSvg}
    </svg>
  `;

  chartDom.querySelectorAll(".fallback-node").forEach(item => {
    item.addEventListener("click", () => {
      const node = graphData.nodes.find(
        candidate => candidate.id === item.dataset.nodeId
      );
      if (node) {
        showNodeDetail(node);
      }
    });
  });
}


function shouldShowNodeLabel(node, visibleNodeCount, isPathNode) {
  if (!graphView.showLabels) {
    return isPathNode;
  }

  if (visibleNodeCount <= 28 || isPathNode) {
    return true;
  }

  const sortedValues = [...graphData.nodes]
    .map(item => Number(item.value || 0))
    .sort((a, b) => b - a);
  const threshold = sortedValues[Math.min(11, sortedValues.length - 1)] || 0;
  return Number(node.value || 0) >= threshold;
}


function getNodeSize(value, maxValue, isPathNode) {
  const minSize = 22;
  const maxSize = 74;

  if (maxValue <= 0) {
    return isPathNode ? 42 : 26;
  }

  const ratio = Math.sqrt(value / maxValue);
  const size = minSize + ratio * (maxSize - minSize);

  return isPathNode ? Math.max(size, 48) : size;
}


function getNodeColor(rank, total, isPathNode) {
  if (isPathNode) {
    return "#d94c4c";
  }

  if (rank < Math.max(3, total * 0.15)) {
    return "#9f2f4a";
  }

  if (rank < Math.max(9, total * 0.45)) {
    return "#3f6fb6";
  }

  return "#4f9c82";
}


function getEdgeColor(relation) {
  const colorMap = {
    "亲属关系": "#9f6a3b",
    "婚姻关系": "#b64561",
    "主仆关系": "#4a79a8",
    "情感关系": "#c05a8b",
    "权力关系": "#7762a8",
    "冲突关系": "#c45643",
    "朋友关系": "#4f9c82",
    "普通共现": "#9aa5b3"
  };

  return colorMap[relation] || "#9aa5b3";
}


function getScaledEdgeWidth(weight, maxWeight) {
  if (maxWeight <= 0) {
    return 1.4;
  }

  const ratio = Math.sqrt(weight / maxWeight);
  return 1.2 + ratio * 5.2;
}


function getEdgeOpacity(weight, maxWeight) {
  if (maxWeight <= 0) {
    return 0.32;
  }

  const ratio = Math.sqrt(weight / maxWeight);
  return 0.22 + ratio * 0.58;
}


function getEdgeCurveness(link) {
  const key = `${link.source}|${link.target}`;
  let hash = 0;

  for (let i = 0; i < key.length; i += 1) {
    hash = (hash + key.charCodeAt(i) * (i + 1)) % 7;
  }

  return (hash - 3) * 0.018;
}


function updateControlText() {
  const minWeightValue = document.getElementById("minWeightValue");

  if (minWeightValue) {
    minWeightValue.textContent = String(graphView.minWeight);
  }
}


function updateGraphStats(visibleNodeCount, visibleLinkCount) {
  const statsBox = document.getElementById("graphStats");

  if (!statsBox) {
    return;
  }

  const totalNodes = graphData.nodes ? graphData.nodes.length : 0;
  const totalLinks = graphData.links ? graphData.links.length : 0;

  statsBox.textContent = `显示 ${visibleNodeCount}/${totalNodes} 个节点，${visibleLinkCount}/${totalLinks} 条关系`;
}


function resetGraphView() {
  graphView.initialized = false;
  syncGraphControls();
  renderGraph();
}


function populateCharacterOptions() {
  const datalist = document.getElementById("characterList");
  datalist.innerHTML = "";

  if (!graphData.nodes) {
    return;
  }

  graphData.nodes.forEach(node => {
    const option = document.createElement("option");
    option.value = node.id;
    datalist.appendChild(option);
  });
}


async function queryShortestPath() {
  const source = document.getElementById("sourceInput").value.trim();
  const target = document.getElementById("targetInput").value.trim();

  if (!source || !target) {
    alert("请输入起点人物和终点人物");
    return;
  }

  if (source === target) {
    alert("起点和终点不能相同");
    return;
  }

  try {
    const response = await apiFetch("/api/path", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source,
        target
      })
    });

    const result = await response.json();

    if (!result.success) {
      alert(result.message || "未找到路径");
      showNoPathResult(result.message || "未找到路径");
      return;
    }

    currentPathNodes = result.path || [];
    currentPathEdges = result.edges || [];

    renderGraph();
    showPathResult(result);

  } catch (error) {
    console.error(error);
    alert("路径查询失败，请检查后端服务。");
  }
}


function showPathResult(result) {
  const pathSummary = document.getElementById("pathSummary");
  const pathDetail = document.getElementById("pathDetail");

  const pathText = result.path.join(" → ");

  pathSummary.innerHTML = `
    <div><b>最短路径：</b></div>
    <div class="path-text">${escapeHtml(pathText)}</div>
    <div><b>路径关系强度总和：</b>${formatNumber(result.total_weight)}</div>
    <div><b>路径总代价：</b>${formatNumber(result.total_cost)}</div>
  `;

  pathDetail.innerHTML = "";

  result.edges.forEach((edge, index) => {
    const item = document.createElement("div");
    item.className = "detail-item";

    const evidenceHtml = renderEvidence(edge.evidence || []);

    item.innerHTML = `
      <div class="detail-title">
        ${index + 1}. ${escapeHtml(edge.source)} → ${escapeHtml(edge.target)}
      </div>
      <div>关系类型：${escapeHtml(edge.relation || "普通共现")}</div>
      <div>关系权重：${formatNumber(edge.weight)}</div>
      <div>路径代价：${formatNumber(edge.cost)}</div>
      ${evidenceHtml}
    `;

    pathDetail.appendChild(item);
  });
}


function showNoPathResult(message) {
  const pathSummary = document.getElementById("pathSummary");
  const pathDetail = document.getElementById("pathDetail");

  pathSummary.textContent = message;
  pathDetail.innerHTML = "";
}


function showNodeDetail(node) {
  const detailBox = document.getElementById("detailBox");
  const relatedLinks = (graphData.links || [])
    .filter(link => link.source === node.id || link.target === node.id)
    .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))
    .slice(0, 6);

  const relationHtml = relatedLinks.length
    ? relatedLinks.map(link => {
      const other = link.source === node.id ? link.target : link.source;
      return `
        <li>
          <b>${escapeHtml(other)}</b>
          <span>${escapeHtml(link.relation || "普通共现")}</span>
          <em>${formatNumber(link.weight || 0)}</em>
        </li>
      `;
    }).join("")
    : "<li>暂无关系记录</li>";

  detailBox.innerHTML = `
    <div class="detail-title">节点：${escapeHtml(node.name)}</div>
    <div>节点强度：${formatNumber(node.value || 0)}</div>
    <div class="mini-list-title">主要关系</div>
    <ul class="mini-list">${relationHtml}</ul>
  `;
}


function showEdgeDetail(edge) {
  const detailBox = document.getElementById("detailBox");
  const evidenceHtml = renderEvidence(edge.evidence || []);

  detailBox.innerHTML = `
    <div class="detail-title">
      ${escapeHtml(edge.source)} - ${escapeHtml(edge.target)}
    </div>
    <div>关系类型：${escapeHtml(edge.relation || "普通共现")}</div>
    <div>关系权重：${formatNumber(edge.weight || 0)}</div>
    <div>路径代价：${formatNumber(edge.cost || 0)}</div>
    ${evidenceHtml}
  `;
}


function renderEvidence(evidenceList) {
  if (typeof evidenceList === "string") {
    evidenceList = evidenceList ? [evidenceList] : [];
  }

  if (!evidenceList || evidenceList.length === 0) {
    return `<div class="evidence-empty">暂无证据片段</div>`;
  }

  const content = evidenceList
    .slice(0, 3)
    .map((text, index) => {
      return `
        <li>
          <span class="evidence-index">${index + 1}.</span>
          ${escapeHtml(text)}
        </li>
      `;
    })
    .join("");

  return `
    <div class="evidence-box">
      <div class="evidence-title">证据片段：</div>
      <ul>${content}</ul>
    </div>
  `;
}


function clearHighlight() {
  currentPathNodes = [];
  currentPathEdges = [];
  renderGraph();

  const pathSummary = document.getElementById("pathSummary");
  const pathDetail = document.getElementById("pathDetail");

  pathSummary.textContent = "暂无路径查询结果";
  pathDetail.innerHTML = "";
}


function edgeKey(edge) {
  const a = edge.source;
  const b = edge.target;

  return [a, b].sort().join("||");
}


function formatNumber(value) {
  const num = Number(value);

  if (Number.isNaN(num)) {
    return value;
  }

  return Number.isInteger(num)
    ? num
    : num.toFixed(4);
}


function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


async function apiFetch(path, options = {}) {
  const errors = [];

  for (const baseUrl of API_BASES) {
    try {
      return await fetch(`${baseUrl}${path}`, options);
    } catch (error) {
      errors.push(`${baseUrl}: ${error.message || error}`);
    }
  }

  throw new Error(
    `无法连接后端。请确认 PyCharm 终端仍在运行 uvicorn，且 http://127.0.0.1:8000/api/health 可以打开。${errors.join("；")}`
  );
}
