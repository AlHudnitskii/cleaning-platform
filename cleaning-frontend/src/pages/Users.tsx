import { useState } from "react";

import { errorMessage } from "../api/errors";
import { COUNTRIES, SORT_ORDERS, USER_ROLES, type Country, type UserResponse, type UserRole } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { RoleBadge } from "../components/Badges";
import { Drawer } from "../components/Drawer";
import { EmptyState, ErrorState, ListSkeleton } from "../components/Feedback";
import { FilterControl } from "../components/Field";
import { optionList, withEmpty } from "../components/options";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { RelativeDate } from "../components/People";
import { Select } from "../components/Select";
import { SortHeader } from "../components/SortHeader";
import { showToast } from "../components/toast";
import { useToggleActive, useUsers } from "../features/users/api";
import { countryName, countryNames } from "../labels";
import { t } from "../i18n/locale";
import { useShortcut } from "../shortcuts";
import { compareText, nextSort, type SortDirection, type SortState } from "../sorting";
import { readEnum, useUrlState } from "../urlState";
import { UserForm } from "../features/users/UserForm";
import { ResetPasswordDialog } from "../features/users/ResetPasswordDialog";

const USER_SORTS = ["email", "role", "country", "created_at"] as const;

type UserSort = (typeof USER_SORTS)[number];

const ROLE_ORDER: Record<UserRole, number> = { admin: 0, manager: 1, cleaner: 2 };

function naturalDirection(key: UserSort): SortDirection {
  return key === "created_at" ? "desc" : "asc";
}

function compareUsers(key: UserSort): (a: UserResponse, b: UserResponse) => number {
  switch (key) {
    case "email":
      return (a, b) => compareText(a.email, b.email);
    case "role":
      return (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || compareText(a.email, b.email);
    case "country":
      return (a, b) =>
        compareText(a.country ? countryNames()[a.country] : null, b.country ? countryNames()[b.country] : null) ||
        compareText(a.email, b.email);
    case "created_at":
      return (a, b) => a.created_at.localeCompare(b.created_at) || compareText(a.email, b.email);
  }
}

function sortUsers(users: UserResponse[], sort: SortState<UserSort>): UserResponse[] {
  const sorted = [...users].sort(compareUsers(sort.key));
  return sort.direction === "desc" ? sorted.reverse() : sorted;
}

export function Users() {
  const currentUser = useCurrentUser();
  const { params, update } = useUrlState();
  const filters = {
    role: readEnum<UserRole>(params, "role", USER_ROLES),
    country: readEnum<Country>(params, "country", COUNTRIES),
  };
  const users = useUsers(filters);
  const sortKey = readEnum<UserSort>(params, "sort", USER_SORTS) ?? "created_at";
  const sort: SortState<UserSort> = {
    key: sortKey,
    direction: readEnum<SortDirection>(params, "order", SORT_ORDERS) ?? naturalDirection(sortKey),
  };
  const rows = users.data ? sortUsers(users.data, sort) : [];

  const handleSort = (column: UserSort) => {
    const next = nextSort(sort, column, naturalDirection);
    update({
      sort: next.key === "created_at" ? undefined : next.key,
      order: next.direction === naturalDirection(next.key) ? undefined : next.direction,
    });
  };
  const toggle = useToggleActive();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserResponse | null>(null);
  const [resetting, setResetting] = useState<UserResponse | null>(null);
  useShortcut("n", () => setCreating(true));

  const handleToggle = (userId: string) => {
    toggle.mutate(userId, {
      onSuccess: (user) => showToast(user.is_active ? t().users.activated(user.email) : t().users.deactivated(user.email)),
      onError: (error) => showToast(errorMessage(error), "error"),
    });
  };

  return (
    <>
      <PageHeader
        title={t().users.title}
        description={t().users.description}
        actions={
          <button type="button" className="btn btn-primary" aria-keyshortcuts="n" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} />
            {t().users.create}
          </button>
        }
      />
      {creating && (
        <Drawer title={t().users.newUser} description={t().users.newUserHint} onClose={() => setCreating(false)}>
          <UserForm
            onCancel={() => setCreating(false)}
            onSaved={(user) => {
              setCreating(false);
              showToast(t().users.created(user.email));
            }}
          />
        </Drawer>
      )}
      {editing && (
        <Drawer title={t().users.editTitle} description={t().users.editHint} onClose={() => setEditing(null)}>
          <UserForm
            existing={editing}
            isSelf={editing.id === currentUser.id}
            onCancel={() => setEditing(null)}
            onResetPassword={() => setResetting(editing)}
            onSaved={(user) => {
              setEditing(null);
              showToast(t().users.saved(user.email));
            }}
          />
        </Drawer>
      )}
      {resetting && (
        <ResetPasswordDialog
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => {
            setResetting(null);
            showToast(t().users.passwordReset(resetting.email));
          }}
        />
      )}

      <section className="list-card" aria-label={t().users.list}>
        <div className="toolbar" role="group" aria-label={t().common.filters}>
          <FilterControl label={t().users.role}>
            <Select
              variant="inline"
              value={filters.role ?? ""}
              options={withEmpty(t().common.all, optionList(USER_ROLES, t().role))}
              onChange={(role) => update({ role })}
            />
          </FilterControl>
          <FilterControl label={t().users.country}>
            <Select
              variant="inline"
              value={filters.country ?? ""}
              options={withEmpty(t().common.all, optionList(COUNTRIES, countryNames()))}
              onChange={(country) => update({ country })}
            />
          </FilterControl>
          <span className="toolbar-spacer" />
          {users.data && <span className="toolbar-count">{t().users.shown(users.data.length)}</span>}
        </div>

        {users.isPending ? (
          <ListSkeleton label={t().users.loading} />
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => void users.refetch()} />
        ) : users.data.length === 0 ? (
          <EmptyState title={t().users.noMatch} hint={t().users.noMatchHint} />
        ) : (
          <div className="table-scroll table-scroll-sticky">
            <table className="table table-rows table-stacked">
              <thead>
                <tr>
                  <th scope="col" className="cell-index">
                    #
                  </th>
                  <SortHeader label={t().users.member} column="email" sort={sort} onSort={handleSort} />
                  <SortHeader label={t().users.role} column="role" sort={sort} onSort={handleSort} />
                  <SortHeader label={t().users.country} column="country" sort={sort} onSort={handleSort} />
                  <SortHeader label={t().users.createdColumn} column="created_at" sort={sort} onSort={handleSort} />
                  <th scope="col" className="cell-actions">
                    <span className="visually-hidden">{t().users.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((user, index) => (
                  <tr key={user.id} className={user.is_active ? undefined : "row-inactive"}>
                    <td className="cell-index">{index + 1}</td>
                    <td className="cell-primary">
                      <span className="member">
                        <span
                          className={`status-dot${user.is_active ? "" : " status-dot-off"}`}
                          title={user.is_active ? t().users.active : t().users.inactive}
                        >
                          <span className="visually-hidden">{user.is_active ? t().users.active : t().users.inactive}</span>
                        </span>{" "}
                        <span className="cell-title">{user.email}</span>
                      </span>
                    </td>
                    <td data-label={t().users.role}>
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="cell-muted" data-label={t().users.country}>
                      {countryName(user.country)}
                    </td>
                    <td className="cell-muted cell-nowrap" data-label={t().users.createdColumn}>
                      <RelativeDate value={user.created_at} />
                    </td>
                    <td className="cell-actions row-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        aria-label={t().users.editUser(user.email)}
                        onClick={() => setEditing(user)}
                      >
                        {t().users.edit}
                      </button>
                      {user.id === currentUser.id ? (
                        <span className="badge tone-accent">{t().common.you}</span>
                      ) : (
                        <button
                          type="button"
                          className={user.is_active ? "btn btn-danger btn-small" : "btn btn-secondary btn-small"}
                          disabled={toggle.isPending}
                          aria-label={user.is_active ? t().users.deactivateUser(user.email) : t().users.activateUser(user.email)}
                          onClick={() => handleToggle(user.id)}
                        >
                          {user.is_active ? t().users.deactivate : t().users.activate}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {users.data && users.data.length > 0 && (
          <div className="list-footer">
            <span className="list-footer-count">
              {t().users.activeOf(users.data.filter((user) => user.is_active).length, users.data.length)}
            </span>
          </div>
        )}
      </section>
    </>
  );
}
