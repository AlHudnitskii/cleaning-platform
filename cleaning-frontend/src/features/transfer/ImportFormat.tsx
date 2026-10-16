
import { t } from "../../i18n/locale";

function columns(): { name: string; required: boolean; description: string }[] {
  const messages = t().importing;
  return [
    { name: "title", required: true, description: messages.columnTitle },
    { name: "country", required: true, description: messages.columnCountry },
    { name: "description", required: false, description: messages.columnDescription },
    { name: "priority", required: false, description: messages.columnPriority },
    { name: "assignee_email", required: false, description: messages.columnAssignee },
    { name: "location_name", required: false, description: messages.columnLocation },
    { name: "rrule", required: false, description: messages.columnRrule },
  ];
}

export function ImportFormatReference({ managerCountry }: { managerCountry: boolean }) {
  return (
    <section className="card" aria-labelledby="format-title">
      <h2 id="format-title" className="section-title">
        {t().importing.format}
      </h2>
      <div className="table-scroll">
        <table className="table table-compact">
          <thead>
            <tr>
              <th scope="col">{t().importing.column}</th>
              <th scope="col">{t().importing.meaning}</th>
            </tr>
          </thead>
          <tbody>
            {columns().map((column) => (
              <tr key={column.name}>
                <td className="cell-nowrap">
                  <code>{column.name}</code>
                  {column.required && <span className="required-mark">{t().importing.required}</span>}
                </td>
                <td className="cell-muted">{column.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {managerCountry && <p className="muted">{t().importing.managerNote}</p>}
    </section>
  );
}
