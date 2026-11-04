import type { MessageShape, ParamNode } from "../types";

function cardinality(p: ParamNode) {
  const repeat = p.maxOccurs === null || p.maxOccurs > 1;
  if (p.minOccurs === 0) return repeat ? "0..*" : "opcional";
  return repeat ? "1..*" : "obrigatório";
}

function Node({ node, depth }: { node: ParamNode; depth: number }) {
  return (
    <li>
      <div className="flex flex-wrap items-baseline gap-x-2 py-0.5">
        <span className="font-mono text-xs font-medium">{node.name}</span>
        <span className="font-mono text-xs text-muted">
          {node.type}
          {(node.maxOccurs === null || node.maxOccurs > 1) && "[]"}
        </span>
        <span className="text-[11px] text-muted">{cardinality(node)}</span>
        {node.enum && (
          <span className="text-[11px] text-muted">valores: {node.enum.join(" | ")}</span>
        )}
        {node.recursive && <span className="text-[11px] text-accent">tipo recursivo</span>}
      </div>
      {node.children && node.children.length > 0 && depth < 6 && (
        <ul className="ml-4 border-l border-border pl-3">
          {node.children.map((child) => (
            <Node key={child.name} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ParamTree({ title, shape }: { title: string; shape: MessageShape }) {
  return (
    <details className="rounded-md border border-border bg-surface-2 p-3" open>
      <summary className="cursor-pointer text-sm font-medium">
        {title}
        {shape.wrapper && (
          <span className="ml-2 font-mono text-xs font-normal text-muted">
            &lt;{shape.wrapper.name}&gt;
          </span>
        )}
      </summary>
      {shape.params.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Sem parâmetros.</p>
      ) : (
        <ul className="mt-2">
          {shape.params.map((param) => (
            <Node key={param.name} node={param} depth={0} />
          ))}
        </ul>
      )}
    </details>
  );
}
