import io
from typing import Any

import pandas as pd
from openpyxl.utils import get_column_letter

EXPORT_COLUMNS = [
    "id",
    "title",
    "description",
    "status",
    "priority",
    "country",
    "location",
    "assignee",
    "created_at",
]
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
MAX_COLUMN_WIDTH = 50


def tasks_to_dataframe(tasks: list[dict[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame(tasks, columns=EXPORT_COLUMNS).fillna("")


def neutralize_formula(value: Any) -> Any:
    if isinstance(value, str) and value.startswith(FORMULA_PREFIXES):
        return "'" + value
    return value


def export_to_parquet(df: pd.DataFrame) -> bytes:
    buffer = io.BytesIO()
    df.to_parquet(buffer, engine="pyarrow", compression="snappy", index=False)
    return buffer.getvalue()


def export_to_excel(df: pd.DataFrame) -> bytes:
    safe = df.map(neutralize_formula)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        safe.to_excel(writer, index=False, sheet_name="Tasks")
        worksheet = writer.sheets["Tasks"]
        for idx, column in enumerate(safe.columns, start=1):
            longest = max((len(str(v)) for v in safe[column]), default=0)
            width = max(int(longest), len(column)) + 2
            worksheet.column_dimensions[get_column_letter(idx)].width = min(width, MAX_COLUMN_WIDTH)
    return buffer.getvalue()
