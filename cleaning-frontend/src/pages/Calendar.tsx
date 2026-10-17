import { errorMessage } from "../api/errors";
import { COUNTRIES, type CalendarTask, type Country } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { ErrorState, ListSkeleton, Notice } from "../components/Feedback";
import { FilterControl } from "../components/Field";
import { Icon } from "../components/Icon";
import { optionList, withEmpty } from "../components/options";
import { PageHeader } from "../components/PageHeader";
import { Select } from "../components/Select";
import { showToast } from "../components/toast";
import { addDays, addMonths, formatDay, mondayIndex, monthGrid, parseDay, toDay, today } from "../dates";
import { CalendarGrid } from "../features/tasks/CalendarGrid";
import { useCalendarTasks, useRescheduleTask } from "../features/tasks/api";
import { useAssignees } from "../features/users/api";
import { dateFormatter } from "../i18n/format";
import { t } from "../i18n/locale";
import { countryNames } from "../labels";
import { readDate, readEnum, readId, useUrlState } from "../urlState";

const VIEWS = ["month", "week"] as const;

type View = (typeof VIEWS)[number];

function visibleDays(view: View, anchor: Date): Date[] {
  if (view === "month") return monthGrid(anchor);
  const monday = addDays(anchor, -mondayIndex(anchor));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function periodLabel(view: View, anchor: Date, first: Date, last: Date): string {
  if (view === "month") return dateFormatter("month-year", { month: "long", year: "numeric" }).format(anchor);
  return `${formatDay(toDay(first))} – ${formatDay(toDay(last))}`;
}

export function Calendar() {
  const user = useCurrentUser();
  const isAdmin = user.role === "admin";
  const isCleaner = user.role === "cleaner";
  const { params, update } = useUrlState();
  const view = readEnum<View>(params, "view", VIEWS) ?? "month";
  const anchorDay = readDate(params, "date") ?? today();
  const anchor = parseDay(anchorDay) ?? new Date();
  const assignee = readId(params, "assignee");
  const country = isAdmin ? readEnum<Country>(params, "country", COUNTRIES) : undefined;
  const days = visibleDays(view, anchor);
  const first = days[0] ?? anchor;
  const last = days.at(-1) ?? anchor;
  const tasks = useCalendarTasks({
    date_from: toDay(first),
    date_to: toDay(last),
    assigned_to: assignee,
    country,
  });
  const assignees = useAssignees(country ?? user.country ?? undefined, !isCleaner);
  const reschedule = useRescheduleTask();

  const shift = (step: number) => {
    const next = view === "month" ? addMonths(anchor, step) : addDays(anchor, 7 * step);
    update({ date: toDay(next) });
  };

  const move = (task: CalendarTask, day: string) => {
    reschedule.mutate(
      { id: task.id, dueDate: day },
      {
        onSuccess: () => showToast(t().planner.moved(task.title, formatDay(day))),
        onError: (error) => showToast(errorMessage(error), "error"),
      },
    );
  };

  return (
    <>
      <PageHeader title={t().planner.title} description={t().planner.description} />
      <div className="toolbar toolbar-plain" role="group" aria-label={t().planner.navigation}>
        <div className="pager-group" role="group" aria-label={t().planner.period}>
          <button
            type="button"
            className="icon-button"
            aria-label={view === "month" ? t().planner.previousMonth : t().planner.previousWeek}
            onClick={() => shift(-1)}
          >
            <Icon name="back" size={15} />
          </button>
          <button type="button" className="pager-size" onClick={() => update({ date: undefined })}>
            {t().planner.today}
          </button>
          <button
            type="button"
            className="icon-button planner-next"
            aria-label={view === "month" ? t().planner.nextMonth : t().planner.nextWeek}
            onClick={() => shift(1)}
          >
            <Icon name="back" size={15} />
          </button>
        </div>
        <h2 className="subsection-title planner-period" aria-live="polite">
          {periodLabel(view, anchor, first, last)}
        </h2>
        <span className="toolbar-spacer" />
        {!isCleaner && (
          <FilterControl label={t().planner.assignee}>
            <Select
              variant="inline"
              value={assignee ?? ""}
              options={withEmpty(
                t().common.all,
                (assignees.data ?? []).map((cleaner) => ({ value: cleaner.id, label: cleaner.email })),
              )}
              onChange={(value) => update({ assignee: value })}
            />
          </FilterControl>
        )}
        {isAdmin && (
          <FilterControl label={t().planner.country}>
            <Select
              variant="inline"
              value={country ?? ""}
              options={withEmpty(t().common.all, optionList(COUNTRIES, countryNames()))}
              onChange={(value) => update({ country: value, assignee: undefined })}
            />
          </FilterControl>
        )}
        <div className="pager-group" role="group" aria-label={t().planner.view}>
          {VIEWS.map((value) => (
            <button
              key={value}
              type="button"
              className="pager-size"
              aria-pressed={view === value}
              onClick={() => update({ view: value === "month" ? undefined : value })}
            >
              {t().planner.views[value]}
            </button>
          ))}
        </div>
      </div>

      {!isCleaner && <p className="field-hint planner-hint">{t().planner.moveHint}</p>}

      {tasks.isPending ? (
        <ListSkeleton label={t().planner.loading} rows={5} columns={7} />
      ) : tasks.isError ? (
        <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : (
        <div className="card planner-card" aria-busy={tasks.isFetching || reschedule.isPending}>
          {tasks.data.truncated && <Notice tone="warning">{t().planner.truncated}</Notice>}
          {tasks.data.data.length === 0 && <p className="muted planner-empty">{t().planner.empty}</p>}
          <CalendarGrid
            days={days}
            tasks={tasks.data.data}
            today={today()}
            view={view}
            month={view === "month" ? anchor.getMonth() : undefined}
            canMove={!isCleaner && !reschedule.isPending}
            onMove={move}
            onShowDay={(day) => update({ view: "week", date: day })}
          />
        </div>
      )}
    </>
  );
}
