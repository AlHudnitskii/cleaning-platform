export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export function optionList<T extends string>(values: readonly T[], labels: Record<T, string>): SelectOption<T>[] {
  return values.map((value) => ({ value, label: labels[value] }));
}

export function withEmpty<T extends string>(label: string, options: SelectOption<T>[]): SelectOption<T | "">[] {
  return [{ value: "", label }, ...options];
}
