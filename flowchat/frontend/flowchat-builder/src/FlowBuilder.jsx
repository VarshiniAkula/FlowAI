import React, { useMemo, useState } from "react";

const defaultFlow = {
  id: "new_flow",
  description: "Visual flow draft",
  start_node: "start",
  nodes: {
    start: { id: "start", type: "message", text: "Hello", next: null },
  },
};

export default function FlowBuilder() {
  const [flow, setFlow] = useState(defaultFlow);
  const [nodeKey, setNodeKey] = useState("start");

  const node = useMemo(() => flow.nodes[nodeKey] || null, [flow.nodes, nodeKey]);

  const updateNode = (patch) => {
    if (!node) return;
    setFlow((prev) => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [nodeKey]: { ...prev.nodes[nodeKey], ...patch },
      },
    }));
  };

  const addNode = () => {
    const id = `node_${Object.keys(flow.nodes).length + 1}`;
    setFlow((prev) => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [id]: { id, type: "message", text: "New node", next: null },
      },
    }));
    setNodeKey(id);
  };

  return (
    <div style={{ padding: 16, fontFamily: "sans-serif" }}>
      <h2>FlowChat Builder</h2>
      <p>Simple visual editor scaffold for flow JSON.</p>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ minWidth: 220 }}>
          <h4>Nodes</h4>
          {Object.keys(flow.nodes).map((id) => (
            <button
              key={id}
              onClick={() => setNodeKey(id)}
              style={{
                display: "block",
                width: "100%",
                marginBottom: 8,
                background: id === nodeKey ? "#dbeafe" : "#f3f4f6",
              }}
            >
              {id}
            </button>
          ))}
          <button onClick={addNode}>+ Add Node</button>
        </div>

        <div style={{ flex: 1 }}>
          <h4>Node Editor</h4>
          {node ? (
            <>
              <label>Type</label>
              <input
                value={node.type || ""}
                onChange={(e) => updateNode({ type: e.target.value })}
                style={{ width: "100%", marginBottom: 8 }}
              />
              <label>Text</label>
              <textarea
                value={node.text || ""}
                onChange={(e) => updateNode({ text: e.target.value })}
                style={{ width: "100%", minHeight: 90, marginBottom: 8 }}
              />
              <label>Next</label>
              <input
                value={node.next || ""}
                onChange={(e) => updateNode({ next: e.target.value || null })}
                style={{ width: "100%", marginBottom: 8 }}
              />
            </>
          ) : (
            <p>Select a node to edit.</p>
          )}
        </div>
      </div>

      <h4>JSON Preview</h4>
      <pre
        style={{
          background: "#111827",
          color: "#f9fafb",
          padding: 12,
          borderRadius: 8,
          overflow: "auto",
        }}
      >
        {JSON.stringify(flow, null, 2)}
      </pre>
    </div>
  );
}
