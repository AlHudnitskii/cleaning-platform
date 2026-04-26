import io
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from datetime import datetime


def tasks_to_dataframe(tasks: list[dict]) -> pd.DataFrame:
    if not tasks:
        return pd.DataFrame(columns=[
            "id", "title", "description", "status",
            "country", "location_id", "assigned_to", "created_at"
        ])

    return pd.DataFrame(tasks)


def export_to_parquet(df: pd.DataFrame) -> bytes:
    table = pa.Table.from_pandas(df)
    buffer = io.BytesIO()
    pq.write_table(table, buffer, compression="snappy")
    return buffer.getvalue()


def export_to_excel(df: pd.DataFrame) -> bytes:
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Tasks")

        worksheet = writer.sheets["Tasks"]
        for idx, col in enumerate(df.columns):
            max_length = max(
                df[col].astype(str).map(len).max(),
                len(col)
            ) + 2
            worksheet.column_dimensions[
                chr(65 + idx)
            ].width = min(max_length, 50)

    return buffer.getvalue()
