import { t } from "../i18n/locale";
import { Drawer } from "./Drawer";

function groups(): { title: string; items: { keys: string[]; label: string }[] }[] {
  const shortcuts = t().shortcuts;
  const nav = t().nav;
  return [
    {
      title: shortcuts.anywhere,
      items: [
        { keys: ["/"], label: shortcuts.search },
        { keys: ["?"], label: shortcuts.showList },
        { keys: ["Esc"], label: shortcuts.close },
      ],
    },
    {
      title: shortcuts.goTo,
      items: [
        { keys: ["G", "D"], label: nav.dashboard },
        { keys: ["G", "T"], label: nav.tasks },
        { keys: ["G", "R"], label: nav.reports },
        { keys: ["G", "L"], label: nav.locations },
        { keys: ["G", "U"], label: nav.users },
        { keys: ["G", "P"], label: nav.profile },
      ],
    },
    {
      title: shortcuts.lists,
      items: [{ keys: ["N"], label: shortcuts.create }],
    },
  ];
}

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Drawer title={t().nav.keyboardShortcuts} description={t().shortcuts.hint} onClose={onClose}>
      <div className="drawer-body">
        {groups().map((group, groupIndex) => (
          <section key={group.title} className="shortcut-group" aria-labelledby={`shortcuts-${groupIndex}`}>
            <h3 id={`shortcuts-${groupIndex}`} className="subsection-title">
              {group.title}
            </h3>
            <dl className="shortcut-list">
              {group.items.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>
                    {item.keys.map((key, index) => (
                      <span key={key}>
                        {index > 0 && <span className="shortcut-then">{t().shortcuts.then}</span>}
                        <kbd className="kbd">{key}</kbd>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Drawer>
  );
}
