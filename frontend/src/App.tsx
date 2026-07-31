import { useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';

// Placeholder nodes / edges — real seed data will be loaded from src/data/ in a later step.
const initialNodes: Node[] = [
  { id: 'user-alice', position: { x: 0, y: 0 }, data: { label: 'Alice (human)' } },
  { id: 'svc-backup', position: { x: 220, y: 100 }, data: { label: 'backup-service (svc)' } },
  { id: 'agent-report', position: { x: 440, y: 200 }, data: { label: 'report-agent (ai)' } },
];

const initialEdges: Edge[] = [
  { id: 'e1', source: 'user-alice', target: 'svc-backup', label: 'delegates_to' },
  { id: 'e2', source: 'svc-backup', target: 'agent-report', label: 'delegates_to' },
];

export default function App() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Identity Blast Radius</h1>
        <span className="app-subtitle">
          Delegation Chain, Escalation & Accountability Tracer
        </span>
      </header>

      <main className="app-main">
        <section className="graph-pane">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
          >
            <Background />
            <MiniMap pannable zoomable />
            <Controls />
          </ReactFlow>
        </section>

        <aside className="side-pane">
          <div className="panel">
            <h2>Accountability</h2>
            <p className="muted">Select a node to see its accountability chain (F4/F5).</p>
          </div>
          <div className="panel">
            <h2>Trust</h2>
            <p className="muted">Trust score and control-change timeline (F9).</p>
          </div>
          <div className="panel">
            <h2>Explanation</h2>
            <p className="muted">LLM narrative + STRIDE threat model (F6, F22).</p>
          </div>
        </aside>
      </main>
    </div>
  );
}
