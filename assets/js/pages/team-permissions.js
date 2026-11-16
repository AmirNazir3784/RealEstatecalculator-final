/* ============================================================
   team-permissions.js — Settings → What people can do.

   Two things live here:

   1. The ROLE templates for Admin and Agent. Changing one changes it
      for everybody on that role who has no exception of their own.
   2. EXCEPTIONS for one person, and a way to put them back on the role.

   One rule shapes the whole screen: nobody can grant what they do not
   hold themselves. The server enforces it (and refuses outright if we
   get it wrong), so every option above the editor's own level is
   disabled here rather than offered and then refused.

   A note on exceptions: the server stores a person's exceptions as one
   set and replaces it wholesale. realtoros_list_members reports those
   exceptions to a caller who may manage the team, so the editor starts
   from the role template with the person's own exceptions laid over it -
   what they actually have today - and saves the complete set back.

   Depends on: app.js, store.js (App.store.team), workspace.js, util.js
   ============================================================ */

window.App = window.App || {};
App.pages = App.pages || {};

App.pages.teamPermissions = (function () {
  "use strict";

  const U = () => App.util;
  const S = () => App.store;
  const W = () => App.workspace;

  // The six scoped areas, in the order the app presents them, with the
  // words a person would actually use for them.
  const AREAS = [
    { key: "contacts",   get label() { return App.i18n.t("Contacts and leads"); } },
    { key: "deals",      get label() { return App.i18n.t("Deals"); } },
    { key: "work",       get label() { return App.i18n.t("Tasks and activities"); } },
    { key: "properties", get label() { return App.i18n.t("Properties"); } },
    { key: "finance",    get label() { return App.i18n.t("Income and expenses"); } },
    { key: "goals",      get label() { return App.i18n.t("Goals"); } }
  ];

  const SCOPES = [
    { value: "none", get label() { return App.i18n.t("Nothing"); } },
    { value: "own",  get label() { return App.i18n.t("Only their own"); } },
    { value: "all",  get label() { return App.i18n.t("Everything in the team"); } }
  ];
  const SCOPE_RANK = { none: 0, own: 1, all: 2 };
  const ACTIONS = [
    { key: "view",   get label() { return App.i18n.t("Can see"); } },
    { key: "edit",   get label() { return App.i18n.t("Can change"); } },
    { key: "delete", get label() { return App.i18n.t("Can delete"); } }
  ];

  // The ten plain yes/no permissions.
  const FLAGS = [
    { key: "contacts_assign",           get label() { return App.i18n.t("Give leads to other people"); } },
    { key: "unassigned_view",           get label() { return App.i18n.t("See leads nobody owns yet"); } },
    { key: "unassigned_claim",          get label() { return App.i18n.t("Claim a lead nobody owns"); } },
    { key: "templates_manage_shared",   get label() { return App.i18n.t("Change the team's shared email templates"); } },
    { key: "templates_create_personal", get label() { return App.i18n.t("Make their own email templates"); } },
    { key: "automation_manage_shared",  get label() { return App.i18n.t("Change the team's shared automations"); } },
    { key: "automation_create_personal",get label() { return App.i18n.t("Make their own automations"); } },
    { key: "imports_file",              get label() { return App.i18n.t("Import leads from a file"); } },
    { key: "integrations_manage",       get label() { return App.i18n.t("Connect Google Sheets and other services"); } },
    { key: "team_manage",               get label() { return App.i18n.t("Manage the team (invite, remove, change roles)"); } }
  ];

  const SETTINGS_LEVELS = [
    { value: "none", get label() { return App.i18n.t("Not at all"); } },
    { value: "view", get label() { return App.i18n.t("Can look"); } },
    { value: "edit", get label() { return App.i18n.t("Can change"); } }
  ];
  const SETTINGS_RANK = { none: 0, view: 1, edit: 2 };

  // Shipped defaults, kept in step with the database presets so "put back
  // to default" and a first-time editor both start from the same place.
  function preset(role) {
    const all = (del) => ({ view: "all", edit: "all", delete: del, create: true });
    if (role === "admin") {
      return {
        contacts: all("all"), deals: all("all"), work: all("all"),
        properties: all("all"), finance: all("all"), goals: all("all"),
        contacts_assign: true, unassigned_view: true, unassigned_claim: true,
        templates_manage_shared: true, templates_create_personal: true,
        automation_manage_shared: true, automation_create_personal: true,
        imports_file: true, integrations_manage: true, team_manage: true,
        settings: "edit"
      };
    }
    return {
      contacts:   { view: "own",  edit: "own",  delete: "none", create: true },
      deals:      { view: "own",  edit: "own",  delete: "none", create: true },
      work:       { view: "own",  edit: "own",  delete: "own",  create: true },
      properties: { view: "all",  edit: "own",  delete: "own",  create: true },
      finance:    { view: "none", edit: "none", delete: "none", create: false },
      goals:      { view: "own",  edit: "own",  delete: "own",  create: true },
      contacts_assign: false, unassigned_view: false, unassigned_claim: false,
      templates_manage_shared: false, templates_create_personal: true,
      automation_manage_shared: false, automation_create_personal: true,
      imports_file: true, integrations_manage: false, team_manage: false,
      settings: "none"
    };
  }

  function has(obj, key) { return obj && Object.prototype.hasOwnProperty.call(obj, key); }

  // Role template with one person's exceptions laid over it, the same way
  // the server merges them: an area is merged key by key, so an exception
  // naming only "view" leaves that area's other actions alone, and anything
  // else replaces the value outright.
  function mergeOverrides(template, overrides) {
    const out = Object.assign({}, template || {});
    const o = (overrides && typeof overrides === "object") ? overrides : {};
    Object.keys(o).forEach(key => {
      const incoming = o[key];
      const current = out[key];
      if (incoming && typeof incoming === "object" && !Array.isArray(incoming) &&
          current && typeof current === "object" && !Array.isArray(current)) {
        out[key] = Object.assign({}, current, incoming);
      } else {
        out[key] = incoming;
      }
    });
    return out;
  }
  function areaOf(perms, key) {
    const a = has(perms, key) ? perms[key] : null;
    return a && typeof a === "object" ? a : { view: "none", edit: "none", delete: "none", create: false };
  }
  function scopeOf(perms, areaKey, action) {
    const v = areaOf(perms, areaKey)[action];
    return (v === "own" || v === "all") ? v : "none";
  }

  // What the editor holds themselves — the ceiling for everything below.
  function myPerms() { return W().permissions() || {}; }
  function myScope(areaKey, action) {
    return W().isOwner() ? "all" : scopeOf(myPerms(), areaKey, action);
  }
  function myFlag(key) { return W().isOwner() ? true : W().can(key); }
  function mySettings() { return W().isOwner() ? "edit" : W().settingsLevel(); }

  // ---------- SCREEN ----------

  let lastPane = null;
  let lastMemberId = null;

  async function render(pane, memberId) {
    if (!pane) return;
    lastPane = pane;
    lastMemberId = memberId || null;
    pane.innerHTML = App.app.loadingHtml("permissions");

    try {
      await W().load();
    } catch (err) {
      pane.innerHTML = App.app.errorHtml(App.i18n.t("Permissions could not load."));
      return;
    }

    if (!W().can("team_manage")) {
      pane.innerHTML = App.i18n.html`${App.i18n.value(() => (head()))}
        <section class="card"><div class="card-body">
          <div class="empty-state">
            <div class="empty-title">You cannot change what people can do</div>
            <div class="empty-desc">Ask an owner or admin.</div>
          </div>
        </div></section>`;
      return;
    }

    if (App.customization && !App.customization.isTeamMode()) {
      pane.innerHTML = App.i18n.html`${App.i18n.value(() => (head()))}
        <section class="card"><div class="card-body">
          <div class="empty-state">
            <div class="empty-title">Team features are off</div>
            <div class="empty-desc">Turn them on in Team &amp; Access first, then come back to set what each role can do.</div>
            <button type="button" class="btn btn-primary" id="goTeamAccess">Open Team &amp; Access</button>
          </div>
        </div></section>`;
      const b = pane.querySelector("#goTeamAccess");
      if (b) b.addEventListener("click", () => App.app.navigate("/settings/team-access"));
      return;
    }

    let stored = {};
    let members = [];
    try {
      const [tpl, mRes] = await Promise.all([S().team.rolePermissions(), S().team.listMembers()]);
      stored = tpl || {};
      if (mRes && mRes.outcome === "ok") members = (mRes.members || []).filter(m => m.status === "active");
    } catch (err) {
      pane.innerHTML = App.i18n.html`${App.i18n.value(() => (head()))}<section class="card"><div class="card-body">${App.i18n.value(() => (App.app.errorHtml(App.i18n.t("Permissions could not load."))))}</div></section>`;
      const retry = pane.querySelector('[data-role="route-retry"]');
      if (retry) retry.addEventListener("click", () => render(pane, memberId));
      return;
    }

    const target = memberId ? members.find(m => m.member_id === memberId) : null;

    pane.innerHTML = `${head()}
      ${ceilingNote()}
      ${target ? personCard(target, stored) : ""}
      ${roleCard("admin", stored)}
      ${roleCard("agent", stored)}
      ${target ? "" : peopleCard(members)}`;

    wireRoleCard(pane, "admin");
    wireRoleCard(pane, "agent");
    if (target) wirePersonCard(pane, target);
    else wirePeopleCard(pane);
  }

  function head() {
    return App.i18n.markup(`<div class="settings-category-head">
      <div class="settings-category-title">What people can do</div>
      <p class="form-help">Set it once for a role, or make an exception for one person. Changes apply the next time they load a page.</p>
    </div>`);
  }

  function ceilingNote() {
    if (W().isOwner()) return "";
    return App.i18n.markup(`<div class="release-callout">
      <strong>You can only give away what you have.</strong>
      Anything above your own level is greyed out here, because the server would refuse it.
    </div>`);
  }

  // ---------- EDITOR ----------
  //
  // One editor, rendered twice (once per role) and a third time for a
  // person's exceptions. `prefix` keeps the field ids apart.

  function editor(prefix, perms) {
    const areaRows = AREAS.map(area => {
      const cells = ACTIONS.map(action => {
        const current = scopeOf(perms, area.key, action.key);
        const ceiling = SCOPE_RANK[myScope(area.key, action.key)];
        const opts = SCOPES.map(sc => {
          const over = SCOPE_RANK[sc.value] > ceiling;
          return App.i18n.html`<option value="${App.i18n.value(() => (sc.value))}" ${App.i18n.value(() => (current === sc.value ? "selected" : ""))} ${App.i18n.value(() => (over ? "disabled" : ""))}>${App.i18n.value(() => (U().esc(sc.label)))}${App.i18n.value(() => (over ? App.i18n.t(" (above your level)") : ""))}</option>`;
        }).join("");
        return App.i18n.html`<td data-label="${App.i18n.value(() => (U().esc(action.label)))}">
          <select data-perm-scope="${App.i18n.value(() => (prefix))}" data-area="${App.i18n.value(() => (area.key))}" data-action="${App.i18n.value(() => (action.key))}"
                  aria-label="${App.i18n.value(() => (U().esc(action.label + " — " + area.label)))}">${App.i18n.value(() => (opts))}</select>
        </td>`;
      }).join("");
      const canCreate = areaOf(perms, area.key).create === true;
      const createCeiling = myScope(area.key, "edit") !== "none" || W().isOwner();
      return App.i18n.html`<tr>
        <td data-label="Area" class="primary-cell"><strong>${App.i18n.value(() => (U().esc(area.label)))}</strong></td>
        ${App.i18n.value(() => (cells))}
        <td data-label="Can add new">
          <label class="toggle-switch" title="${App.i18n.value(() => (canCreate ? "Yes" : "No"))}">
            <input type="checkbox" data-perm-create="${App.i18n.value(() => (prefix))}" data-area="${App.i18n.value(() => (area.key))}"
                   ${App.i18n.value(() => (canCreate ? "checked" : ""))} ${App.i18n.value(() => (createCeiling ? "" : "disabled"))}
                   aria-label="Can add new ${App.i18n.value(() => (U().esc(area.label)))}">
            <span class="toggle-track"></span>
          </label>
        </td>
      </tr>`;
    }).join("");

    const flagRows = FLAGS.map(f => {
      const on = perms[f.key] === true;
      const allowed = myFlag(f.key);
      return App.i18n.html`<div class="split-row">
        <div class="split-row-main">
          <div class="split-row-label">
            <strong>${App.i18n.value(() => (U().esc(f.label)))}</strong>
            ${App.i18n.value(() => (allowed ? "" : App.i18n.markup(`<div class="form-help">You do not have this yourself, so you cannot give it.</div>`)))}
          </div>
        </div>
        <label class="toggle-switch" title="${App.i18n.value(() => (on ? "Yes" : "No"))}">
          <input type="checkbox" data-perm-flag="${App.i18n.value(() => (prefix))}" data-flag="${App.i18n.value(() => (f.key))}"
                 ${App.i18n.value(() => (on ? "checked" : ""))} ${App.i18n.value(() => (allowed ? "" : "disabled"))} aria-label="${App.i18n.value(() => (U().esc(f.label)))}">
          <span class="toggle-track"></span>
        </label>
      </div>`;
    }).join("");

    const settingsNow = (perms.settings === "view" || perms.settings === "edit") ? perms.settings : "none";
    const settingsCeiling = SETTINGS_RANK[mySettings()];
    const settingsOpts = SETTINGS_LEVELS.map(l => {
      const over = SETTINGS_RANK[l.value] > settingsCeiling;
      return App.i18n.html`<option value="${App.i18n.value(() => (l.value))}" ${App.i18n.value(() => (settingsNow === l.value ? "selected" : ""))} ${App.i18n.value(() => (over ? "disabled" : ""))}>${App.i18n.value(() => (U().esc(l.label)))}${App.i18n.value(() => (over ? App.i18n.t(" (above your level)") : ""))}</option>`;
    }).join("");

    return App.i18n.html`
      <div class="table-wrap">
        <table class="tbl tbl-responsive">
          <thead>
            <tr>
              <th>Area</th>
              ${App.i18n.value(() => (ACTIONS.map(a => App.i18n.html`<th>${App.i18n.value(() => (U().esc(a.label)))}</th>`).join("")))}
              <th>Can add new</th>
            </tr>
          </thead>
          <tbody>${App.i18n.value(() => (areaRows))}</tbody>
        </table>
      </div>
      <div style="padding:14px 16px 0">${App.i18n.value(() => (flagRows))}</div>
      <div style="padding:14px 16px 0">
        <label class="field" style="max-width:320px">
          <span>Workspace settings</span>
          <select data-perm-settings="${App.i18n.value(() => (prefix))}" aria-label="Workspace settings">${App.i18n.value(() => (settingsOpts))}</select>
        </label>
      </div>`;
  }

  // Reads an editor back out of the DOM into the shape the server wants.
  function collect(pane, prefix) {
    const perms = {};
    AREAS.forEach(area => {
      const entry = { view: "none", edit: "none", delete: "none", create: false };
      ACTIONS.forEach(action => {
        const sel = pane.querySelector(`[data-perm-scope="${prefix}"][data-area="${area.key}"][data-action="${action.key}"]`);
        if (sel) entry[action.key] = sel.value;
      });
      const cb = pane.querySelector(`[data-perm-create="${prefix}"][data-area="${area.key}"]`);
      entry.create = !!(cb && cb.checked);
      perms[area.key] = entry;
    });
    FLAGS.forEach(f => {
      const cb = pane.querySelector(`[data-perm-flag="${prefix}"][data-flag="${f.key}"]`);
      perms[f.key] = !!(cb && cb.checked);
    });
    const st = pane.querySelector(`[data-perm-settings="${prefix}"]`);
    perms.settings = st ? st.value : "none";
    return perms;
  }

  // ---------- ROLE TEMPLATES ----------

  function roleCard(role, stored) {
    const label = role === "admin" ? "Admins" : "Agents";
    const perms = has(stored, role) && stored[role] ? stored[role] : preset(role);
    const custom = has(stored, role) && !!stored[role];
    return App.i18n.html`
      <section class="card" data-card="role-${App.i18n.value(() => (role))}">
        <div class="card-header">
          <div class="card-title">${App.i18n.value(() => (label))} ${App.i18n.value(() => (custom ? App.i18n.markup(`<span class="badge badge-info">Changed</span>`) : App.i18n.markup(`<span class="badge badge-neutral">Default</span>`)))}</div>
        </div>
        <div class="card-body zero">
          <p class="form-help" style="padding:12px 16px 0">${App.i18n.value(() => (role === "admin"
            ? App.i18n.t("Admins help run the team. This applies to every admin without an exception of their own.")
            : App.i18n.t("Agents work their own leads. This applies to every agent without an exception of their own.")))}</p>
          ${App.i18n.value(() => (editor("role-" + role, perms)))}
          <div style="display:flex;gap:8px;flex-wrap:wrap;padding:16px">
            <button class="btn btn-primary" data-save-role="${App.i18n.value(() => (role))}">Save ${App.i18n.value(() => (label.toLowerCase()))}</button>
            <button class="btn" data-default-role="${App.i18n.value(() => (role))}">Put back to default</button>
          </div>
          <div class="field-error-hint" data-role-error="${App.i18n.value(() => (role))}" role="alert" hidden style="padding:0 16px 16px"></div>
        </div>
      </section>`;
  }

  function wireRoleCard(pane, role) {
    const save = pane.querySelector(`[data-save-role="${role}"]`);
    const reset = pane.querySelector(`[data-default-role="${role}"]`);
    const err = pane.querySelector(`[data-role-error="${role}"]`);
    const showErr = (m) => { if (err) { App.i18n.setText(err, App.i18n.value(() => (m))); err.hidden = false; } };

    if (save) save.addEventListener("click", async () => {
      if (err) err.hidden = true;
      save.disabled = true;
      try {
        await S().team.setRolePermissions(role, collect(pane, "role-" + role));
        App.app.toast(App.i18n.t("Saved. ") + (role === "admin" ? "Admins" : "Agents") + App.i18n.t(" updated."), "success");
        await refresh();
      } catch (e) {
        save.disabled = false;
        showErr(refusalText(e));
      }
    });

    if (reset) reset.addEventListener("click", () => {
      App.app.confirmDialog({
        title: "Put " + (role === "admin" ? "admins" : "agents") + " back to default?",
        get message() { return App.i18n.t("Everybody on this role goes back to what the app ships with. Exceptions set for one person are not touched."); },
        okLabel: "Put back to default"
      }, async () => {
        if (err) err.hidden = true;
        try {
          await S().team.setRolePermissions(role, preset(role));
          App.app.toast(App.i18n.t("Put back to default."), "success");
          await refresh();
        } catch (e) {
          showErr(refusalText(e));
        }
      });
    });
  }

  // ---------- ONE PERSON ----------

  function personCard(member, stored) {
    const name = (member.name && String(member.name).trim()) || member.email || "This person";
    const template = has(stored, member.role) && stored[member.role] ? stored[member.role] : preset(member.role);
    const overrides = (member.permission_overrides && typeof member.permission_overrides === "object")
      ? member.permission_overrides : {};
    const hasAny = Object.keys(overrides).length > 0;
    const base = mergeOverrides(template, overrides);
    return App.i18n.html`
      <section class="card" data-card="person">
        <div class="card-header">
          <div class="card-title">Just for ${App.i18n.value(() => (U().esc(name)))}</div>
          <button class="btn btn-sm" id="personBack">Back to the team</button>
        </div>
        <div class="card-body zero">
          <p class="form-help" style="padding:12px 16px 0">
            ${App.i18n.value(() => (U().esc(name)))} is ${App.i18n.value(() => (member.role === "admin" ? App.i18n.t("an admin") : App.i18n.t("an agent")))}.
            ${App.i18n.value(() => (hasAny
              ? "This is what they can do today: their " + (member.role === "admin" ? App.i18n.t("admin") : App.i18n.t("agent")) + " role, with the exceptions already set for them. Saving replaces those exceptions with whatever is below."
              : "This starts from what that role can do. Change anything below and save to make it an exception for " + U().esc(name) + " alone."))}
          </p>
          ${App.i18n.value(() => (hasAny ? App.i18n.html`<p class="form-help" style="padding:6px 16px 0"><span class="badge badge-info">Custom permissions</span> They are not on the plain ${App.i18n.value(() => (U().esc(member.role === "admin" ? App.i18n.t("admin") : App.i18n.t("agent"))))} role.</p>` : ""))}
          ${App.i18n.value(() => (editor("member", base)))}
          <div style="display:flex;gap:8px;flex-wrap:wrap;padding:16px">
            <button class="btn btn-primary" id="savePerson">Save for ${App.i18n.value(() => (U().esc(name)))}</button>
            <button class="btn" id="resetPerson">Put back on the ${App.i18n.value(() => (member.role === "admin" ? App.i18n.t("admin") : App.i18n.t("agent")))} role</button>
          </div>
          <div class="field-error-hint" id="personError" role="alert" hidden style="padding:0 16px 16px"></div>
        </div>
      </section>`;
  }

  function wirePersonCard(pane, member) {
    const back = pane.querySelector("#personBack");
    if (back) back.addEventListener("click", () => App.app.navigate("/settings/team-access"));
    const err = pane.querySelector("#personError");
    const showErr = (m) => { if (err) { App.i18n.setText(err, App.i18n.value(() => (m))); err.hidden = false; } };
    const save = pane.querySelector("#savePerson");
    const reset = pane.querySelector("#resetPerson");

    if (save) save.addEventListener("click", async () => {
      if (err) err.hidden = true;
      save.disabled = true;
      try {
        await S().team.setMemberPermissions(member.member_id, collect(pane, "member"));
        App.app.toast(App.i18n.t("Saved for this person."), "success");
        App.app.navigate("/settings/team-access");
      } catch (e) {
        save.disabled = false;
        showErr(refusalText(e));
      }
    });

    if (reset) reset.addEventListener("click", () => {
      App.app.confirmDialog({
        get title() { return App.i18n.t("Put them back on their role?"); },
        get message() { return App.i18n.t("Their exceptions are cleared. From then on they get whatever their role gets."); },
        okLabel: "Put back on the role"
      }, async () => {
        if (err) err.hidden = true;
        try {
          await S().team.resetMemberPermissions(member.member_id);
          App.app.toast(App.i18n.t("They are back on their role."), "success");
          App.app.navigate("/settings/team-access");
        } catch (e) {
          showErr(refusalText(e));
        }
      });
    });
  }

  function peopleCard(members) {
    const others = members.filter(m => m.is_self !== true && m.role !== "owner");
    if (!others.length) return "";
    return App.i18n.html`
      <section class="card" data-card="people">
        <div class="card-header"><div class="card-title">An exception for one person</div></div>
        <div class="card-body">
          <p class="form-help">Most teams never need this. It is here for the one person who needs a little more, or a little less, than their role.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <label class="field" style="margin:0;min-width:240px">
              <span>Person</span>
              <select id="personPick">
                ${App.i18n.value(() => (others.map(m => App.i18n.html`<option value="${App.i18n.value(() => (U().esc(m.member_id)))}">${App.i18n.value(() => (U().esc((m.name && String(m.name).trim()) || m.email || App.i18n.t("Member"))))} — ${App.i18n.value(() => (U().esc(m.role === "admin" ? App.i18n.t("Admin") : App.i18n.t("Agent"))))}</option>`).join("")))}
              </select>
            </label>
            <button class="btn" id="personPickBtn">Set an exception</button>
          </div>
        </div>
      </section>`;
  }

  function wirePeopleCard(pane) {
    const btn = pane.querySelector("#personPickBtn");
    const sel = pane.querySelector("#personPick");
    if (btn && sel) btn.addEventListener("click", () => {
      if (!sel.value) return;
      App.app.navigate("/settings/team-permissions?member=" + encodeURIComponent(sel.value));
    });
  }

  // The server raises rather than returning an outcome when a change would
  // hand out more than the caller holds, and names the permission in the
  // message. That name is the useful part, so it is passed through.
  function refusalText(err) {
    const msg = err && err.message ? String(err.message) : "";
    const m = /cannot raise your own permissions:\s*(.+)$/i.exec(msg);
    if (m) return "You cannot give away more than you have: " + m[1];
    if (/permission|not authenticated/i.test(msg)) return "Only an owner or admin can change this.";
    return "Could not save. Please try again.";
  }

  async function refresh() {
    if (lastPane) await render(lastPane, lastMemberId);
  }

  return { render, preset, collect, refusalText, mergeOverrides };
})();
