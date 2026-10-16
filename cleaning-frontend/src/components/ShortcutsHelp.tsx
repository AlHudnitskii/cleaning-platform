import { Drawer } from "./Drawer";

const GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "Anywhere",
    items: [
      { keys: ["/"], label: "Search on the current page" },
      { keys: ["?"], label: "Show this list" },
      { keys: ["Esc"], label: "Close a panel, menu or calendar" },
    ],
  },
  {
    title: "Go to",
    items: [
      { keys: ["G", "D"], label: "Dashboard" },
      { keys: ["G", "T"], label: "Tasks" },
      { keys: ["G", "R"], label: "Reports" },
      { keys: ["G", "L"], label: "Locations" },
      { keys: ["G", "U"], label: "Users" },
      { keys: ["G", "P"], label: "Profile" },
    ],
  },
  {
    title: "Lists",
    items: [{ keys: ["N"], label: "Create a task, user or location" }],
  },
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Drawer title="Keyboard shortcuts" description="Shortcuts are ignored while you type in a field." onClose={onClose}>
      <div className="drawer-body">
        {GROUPS.map((group) => (
          <section key={group.title} className="shortcut-group" aria-labelledby={`shortcuts-${group.title}`}>
            <h3 id={`shortcuts-${group.title}`} className="subsection-title">
              {group.title}
            </h3>
            <dl className="shortcut-list">
              {group.items.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>
                    {item.keys.map((key, index) => (
                      <span key={key}>
                        {index > 0 && <span className="shortcut-then">then</span>}
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
