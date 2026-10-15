import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function StatCard({
  label,
  value,
  tone = "neutral",
  sub,
  to,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  sub?: ReactNode;
  to?: string;
}) {
  const body = (
    <>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </>
  );
  return to ? (
    <Link className={`stat-card stat-${tone} stat-link`} to={to}>
      {body}
    </Link>
  ) : (
    <div className={`stat-card stat-${tone}`}>{body}</div>
  );
}

export interface BarItem {
  key: string;
  label: string;
  value: number;
  tone?: string;
  to?: string;
}

export function BarList({ items, emptyText = "No data" }: { items: BarItem[]; emptyText?: string }) {
  if (items.length === 0) return <p className="muted">{emptyText}</p>;
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="bar-list">
      {items.map((item) => {
        const content = (
          <>
            <span className="bar-label">{item.label}</span>
            <span className="bar-track" aria-hidden="true">
              <span className={`bar-fill tone-${item.tone ?? "accent"}`} style={{ width: `${(item.value / max) * 100}%` }} />
            </span>
            <span className="bar-value">{item.value}</span>
          </>
        );
        return (
          <li key={item.key}>
            {item.to ? (
              <Link className="bar-row bar-link" to={item.to}>
                {content}
              </Link>
            ) : (
              <div className="bar-row">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface SeriesPoint {
  key: string;
  label: string;
  value: number;
  to?: string;
}

export function ColumnChart({ points, emptyText }: { points: SeriesPoint[]; emptyText: string }) {
  if (points.length === 0) return <p className="muted">{emptyText}</p>;
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <ol className="column-chart">
      {points.map((point) => {
        const column = (
          <>
            <span className="column-track" aria-hidden="true">
              <span className="column-bar" style={{ height: `${(point.value / max) * 100}%` }} />
            </span>
            <span className="column-value">{point.value}</span>
            <span className="column-label">{point.label}</span>
          </>
        );
        return (
          <li key={point.key} className="column">
            {point.to ? (
              <Link to={point.to} className="column-link" aria-label={`${point.label}: ${point.value} tasks`}>
                {column}
              </Link>
            ) : (
              column
            )}
          </li>
        );
      })}
    </ol>
  );
}

const WIDTH = 600;
const HEIGHT = 120;
const PAD_X = 40;
const PAD_Y = 14;

export function LineChart({ points, emptyText, title }: { points: SeriesPoint[]; emptyText: string; title: string }) {
  if (points.length === 0) return <p className="muted">{emptyText}</p>;
  const max = Math.max(...points.map((p) => p.value), 1);
  const coords = points.map((point, index) => ({
    ...point,
    x: PAD_X + (index / Math.max(points.length - 1, 1)) * (WIDTH - PAD_X * 2),
    y: PAD_Y + (1 - point.value / max) * (HEIGHT - PAD_Y * 2),
  }));
  const line = coords.map((c, index) => `${index === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const first = coords[0];
  const last = coords[coords.length - 1];
  const area = first && last ? `${line} L ${last.x} ${HEIGHT} L ${first.x} ${HEIGHT} Z` : "";

  return (
    <figure className="line-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT + 24}`} role="img" aria-label={title}>
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            className="line-grid"
            x1={PAD_X}
            x2={WIDTH - PAD_X}
            y1={PAD_Y + t * (HEIGHT - PAD_Y * 2)}
            y2={PAD_Y + t * (HEIGHT - PAD_Y * 2)}
          />
        ))}
        <path className="line-area" d={area} />
        <path className="line-path" d={line} />
        {coords.map((c) => (
          <g key={c.key}>
            <circle className="line-dot" cx={c.x} cy={c.y} r="4" />
            <text className="line-value" x={c.x} y={c.y - 8} textAnchor="middle">
              {c.value}
            </text>
            <text className="line-label" x={c.x} y={HEIGHT + 18} textAnchor="middle">
              {c.label}
            </text>
          </g>
        ))}
      </svg>
      <table className="visually-hidden">
        <caption>{title}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{p.label}</th>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
