import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { DatePicker } from "./DatePicker";

function Harness({ initial, min, onChange }: { initial: string; min?: string; onChange: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="from">From</label>
      <DatePicker
        id="from"
        value={value}
        min={min}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </>
  );
}

describe("DatePicker", () => {
  it("opens on the selected month with focus on the selected day", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2026-10-15" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "From" }));

    expect(screen.getByRole("dialog", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /15 October 2026/ })).toHaveFocus();
  });

  it("moves between days and months with the keyboard and picks with Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="2026-10-31" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "From" });

    await user.click(trigger);
    await user.keyboard("{ArrowRight}{PageDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("2026-12-01");
    expect(trigger).toHaveTextContent("1 Dec 2026");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("does not allow days before the minimum", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="2026-10-15" min="2026-10-10" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "From" }));

    expect(screen.getByRole("button", { name: /^Friday,? 9 October 2026/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /10 October 2026/ })).toBeEnabled();
  });

  it("clears the value and closes on Escape", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="2026-10-15" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "From" });

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenCalledWith("");
    expect(trigger).toHaveTextContent("Any date");
  });
});
