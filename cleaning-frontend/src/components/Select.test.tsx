import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { Select } from "./Select";

const OPTIONS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "done", label: "Done" },
] as const;

function Harness({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState<string>("");
  return (
    <>
      <label htmlFor="status">Status</label>
      <Select
        id="status"
        value={value}
        options={OPTIONS}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </>
  );
}

describe("Select", () => {
  it("is labelled and shows the selected option", () => {
    render(<Harness onChange={vi.fn()} />);

    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("All");
  });

  it("chooses an option with the keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const combobox = screen.getByRole("combobox", { name: "Status" });

    combobox.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("done");
    expect(combobox).toHaveTextContent("Done");
    expect(combobox).toHaveAttribute("aria-expanded", "false");
    expect(combobox).toHaveFocus();
  });

  it("jumps to an option by typing its first letters", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    screen.getByRole("combobox", { name: "Status" }).focus();
    await user.keyboard("{ArrowDown}p{Enter}");

    expect(onChange).toHaveBeenCalledWith("pending");
  });

  it("closes on Escape without changing the value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const combobox = screen.getByRole("combobox", { name: "Status" });

    await user.click(combobox);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(combobox).toHaveTextContent("All");
  });

  it("marks the selected option and closes when clicking outside", async () => {
    const user = userEvent.setup();
    render(<Harness onChange={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    expect(screen.getByRole("option", { name: "All" })).toHaveAttribute("aria-selected", "true");
    await user.click(document.body);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
