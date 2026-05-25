import json
import networkx as nx


def load_graph(graph_path):
    with open(graph_path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_networkx_graph(graph_data):
    G = nx.Graph()

    for node in graph_data["nodes"]:
        G.add_node(node["id"], **node)

    for link in graph_data["links"]:
        G.add_edge(
            link["source"],
            link["target"],
            relation=link.get("relation", "普通共现"),
            weight=link.get("weight", 1),
            cost=link.get("cost", 1),
            evidence=link.get("evidence", [])
        )

    return G


def find_shortest_path(graph_data, source, target):
    G = build_networkx_graph(graph_data)

    if source not in G:
        return {"success": False, "message": f"人物不存在：{source}"}

    if target not in G:
        return {"success": False, "message": f"人物不存在：{target}"}

    try:
        path = nx.shortest_path(G, source=source, target=target, weight="cost")
    except nx.NetworkXNoPath:
        return {"success": False, "message": "两个人物之间不存在路径"}

    edges = []
    total_weight = 0
    total_cost = 0

    for i in range(len(path) - 1):
        u = path[i]
        v = path[i + 1]
        edge = G[u][v]

        total_weight += edge["weight"]
        total_cost += edge["cost"]

        edges.append({
            "source": u,
            "target": v,
            "relation": edge["relation"],
            "weight": edge["weight"],
            "cost": edge["cost"],
            "evidence": edge["evidence"]
        })

    return {
        "success": True,
        "path": path,
        "edges": edges,
        "total_weight": total_weight,
        "total_cost": total_cost
    }