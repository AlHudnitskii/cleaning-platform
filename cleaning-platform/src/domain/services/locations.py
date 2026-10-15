import uuid
from collections.abc import Iterable
from dataclasses import dataclass

from src.domain.models.enums import LocationLevel

FULL_NAME_SEPARATOR = " / "


@dataclass(frozen=True)
class LocationNode:
    id: uuid.UUID
    parent_id: uuid.UUID | None
    name: str


def build_path(parent_path: str | None, location_id: uuid.UUID) -> str:
    label = location_id.hex
    return f"{parent_path}.{label}" if parent_path else label


def child_error(parent_level: LocationLevel, parent_country: str, level: LocationLevel, country: str) -> str | None:
    if parent_country != country:
        return "Child location must be in the same country as its parent"
    if level.depth <= parent_level.depth:
        return f"A {level} cannot be placed inside a {parent_level}"
    return None


def full_names(nodes: Iterable[LocationNode]) -> dict[uuid.UUID, list[str]]:
    by_id = {node.id: node for node in nodes}
    resolved: dict[uuid.UUID, list[str]] = {}

    def resolve(node_id: uuid.UUID) -> list[str]:
        chain: list[LocationNode] = []
        seen: set[uuid.UUID] = set()
        current: uuid.UUID | None = node_id
        while current is not None and current in by_id and current not in resolved and current not in seen:
            seen.add(current)
            node = by_id[current]
            chain.append(node)
            current = node.parent_id
        prefix = resolved.get(current, []) if current is not None else []
        for node in reversed(chain):
            prefix = [*prefix, node.name]
            resolved[node.id] = prefix
        return resolved[node_id]

    for node_id in by_id:
        resolve(node_id)
    return resolved
