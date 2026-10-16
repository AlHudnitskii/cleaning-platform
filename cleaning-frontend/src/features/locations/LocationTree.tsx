import { useState } from "react";

import { LOCATION_LEVELS, type Country, type LocationLevel } from "../../api/types";
import { LevelBadge } from "../../components/Badges";
import { Icon } from "../../components/Icon";
import { type LocationNode } from "./api";
import { t } from "../../i18n/locale";

export type OpenMode = "default" | "all" | "none";

export interface TreeActions {
  add: (draft: LocationDraft) => void;
  rename: (node: LocationNode) => void;
  remove: (node: LocationNode) => void;
}

export interface LocationDraft {
  country: Country;
  level: LocationLevel;
  parentId: string;
}

function childDraft(node: LocationNode): LocationDraft {
  const level = LOCATION_LEVELS[LOCATION_LEVELS.indexOf(node.level) + 1] ?? node.level;
  return { country: node.country, level, parentId: node.id };
}

function countDescendants(node: LocationNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function initiallyOpen(mode: OpenMode, depth: number): boolean {
  if (mode === "all") return true;
  if (mode === "none") return false;
  return depth < 2;
}

function Highlighted({ text, highlight }: { text: string; highlight: string }) {
  const index = highlight ? text.toLowerCase().indexOf(highlight.toLowerCase()) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + highlight.length)}</mark>
      {text.slice(index + highlight.length)}
    </>
  );
}

export function LocationTreeNode({
  node,
  depth,
  openMode,
  highlight,
  actions,
}: {
  node: LocationNode;
  depth: number;
  openMode: OpenMode;
  highlight: string;
  actions?: TreeActions;
}) {
  const [expanded, setExpanded] = useState(() => initiallyOpen(openMode, depth));
  const hasChildren = node.children.length > 0;
  const nested = countDescendants(node);
  const canHaveChildren = node.level !== "room";

  return (
    <li className={`tree-node level-${node.level}`}>
      <div className="tree-row">
        {hasChildren ? (
          <button
            type="button"
            className="tree-toggle"
            aria-expanded={expanded}
            aria-label={expanded ? t().locations.collapse(node.name) : t().locations.expand(node.name)}
            onClick={() => setExpanded((v) => !v)}
          >
            <Icon name={expanded ? "chevronDown" : "chevronRight"} size={13} />
          </button>
        ) : (
          <span className="tree-toggle-placeholder" aria-hidden="true" />
        )}
        <span className="tree-name">
          <Highlighted text={node.name} highlight={highlight} />
        </span>
        <LevelBadge level={node.level} />
        {nested > 0 && <span className="tree-count">{t().locations.inside(nested)}</span>}
        {actions && (
          <span className="tree-actions">
            {canHaveChildren && (
              <button
                type="button"
                className="icon-button tree-add"
                aria-label={t().locations.addInside(node.name)}
                title={t().locations.addInsideShort(node.name)}
                onClick={() => actions.add(childDraft(node))}
              >
                <Icon name="plus" size={14} />
              </button>
            )}
            <button
              type="button"
              className="icon-button tree-add"
              aria-label={t().locations.rename(node.name)}
              title={t().locations.rename(node.name)}
              onClick={() => actions.rename(node)}
            >
              <Icon name="edit" size={14} />
            </button>
            <button
              type="button"
              className="icon-button tree-add"
              aria-label={t().locations.remove(node.name)}
              title={t().locations.remove(node.name)}
              onClick={() => actions.remove(node)}
            >
              <Icon name="trash" size={14} />
            </button>
          </span>
        )}
      </div>
      {expanded && hasChildren && (
        <ul>
          {node.children.map((child) => (
            <LocationTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              openMode={openMode}
              highlight={highlight}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
