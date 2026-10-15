import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../api/errors";
import { COUNTRIES, USER_ROLES, type Country, type UserRole } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { ActiveBadge, RoleBadge } from "../components/Badges";
import { EmptyState, ErrorState, Loading, Notice } from "../components/Feedback";
import { Field, Options } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { useCreateUser, useToggleActive, useUsers } from "../features/users/api";
import { COUNTRY_NAMES, ROLE_LABELS, countryName, formatDate } from "../labels";
import { readEnum, useUrlState } from "../urlState";

export function Users() {
  const currentUser = useCurrentUser();
  const { params, update } = useUrlState();
  const filters = {
    role: readEnum<UserRole>(params, "role", USER_ROLES),
    country: readEnum<Country>(params, "country", COUNTRIES),
  };
  const users = useUsers(filters);
  const toggle = useToggleActive();
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <PageHeader
        title="Users"
        description="Accounts of administrators, managers and cleaners. Deactivation signs the user out immediately."
        actions={
          <button type="button" className="btn btn-primary" aria-expanded={showForm} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close form" : "Create user"}
          </button>
        }
      />
      {showForm && <UserForm onCreated={() => setShowForm(false)} />}
      {toggle.isError && <Notice tone="error">{errorMessage(toggle.error)}</Notice>}

      <section className="filters" aria-label="Filters">
        <Field label="Role">
          <select className="input" value={filters.role ?? ""} onChange={(e) => update({ role: e.target.value })}>
            <Options values={USER_ROLES} labels={ROLE_LABELS} empty="All roles" />
          </select>
        </Field>
        <Field label="Country">
          <select className="input" value={filters.country ?? ""} onChange={(e) => update({ country: e.target.value })}>
            <Options values={COUNTRIES} labels={COUNTRY_NAMES} empty="All countries" />
          </select>
        </Field>
        {users.data && <span className="filters-summary muted">{users.data.length} users</span>}
      </section>

      {users.isPending ? (
        <Loading label="Loading users" />
      ) : users.isError ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : users.data.length === 0 ? (
        <EmptyState title="No users match these filters" />
      ) : (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Country</th>
                <th scope="col">Created</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((user) => (
                <tr key={user.id} className={user.is_active ? undefined : "row-inactive"}>
                  <td>{user.email}</td>
                  <td>
                    <RoleBadge role={user.role} />
                  </td>
                  <td>{countryName(user.country)}</td>
                  <td>{formatDate(user.created_at)}</td>
                  <td>
                    <ActiveBadge active={user.is_active} />
                  </td>
                  <td className="cell-actions">
                    {user.id === currentUser.id ? (
                      <span className="muted">You</span>
                    ) : (
                      <button
                        type="button"
                        className={user.is_active ? "btn btn-danger btn-small" : "btn btn-success btn-small"}
                        disabled={toggle.isPending}
                        onClick={() => toggle.mutate(user.id)}
                      >
                        {user.is_active ? "Deactivate" : "Activate"}
                        <span className="visually-hidden"> {user.email}</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function UserForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("cleaner");
  const [country, setCountry] = useState<Country>("DE");
  const create = useCreateUser();

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate(
      { email, password, role, country: role === "admin" ? undefined : country },
      { onSuccess: onCreated },
    );
  };

  return (
    <section className="card" aria-labelledby="new-user-title">
      <h2 id="new-user-title" className="section-title">
        New user
      </h2>
      {create.isError && <Notice tone="error">{errorMessage(create.error)}</Notice>}
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="Email">
            <input className="input" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password" hint="At least 6 characters.">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Role">
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <Options values={USER_ROLES} labels={ROLE_LABELS} />
            </select>
          </Field>
          <Field label="Country" hint={role === "admin" ? "Administrators are not bound to a country." : undefined}>
            <select
              className="input"
              value={country}
              disabled={role === "admin"}
              onChange={(e) => setCountry(e.target.value as Country)}
            >
              <Options values={COUNTRIES} labels={COUNTRY_NAMES} />
            </select>
          </Field>
        </div>
        <button className="btn btn-primary" type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create user"}
        </button>
      </form>
    </section>
  );
}
