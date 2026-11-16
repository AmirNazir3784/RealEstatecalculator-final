/* ============================================================
   customFieldsUI.js — shared "Custom Fields" section renderer used by every
   record form (contacts/properties/deals/tasks). One implementation of
   field-type rendering, form-value collection, and required-field checking
   so each form integrates in a few lines instead of reimplementing this.
   Depends on: util.js, store.js.
   ============================================================ */
window.App = window.App || {};
App.customFieldsUI = (function () {
  "use strict";
  const U = () => App.util;
  const CF = () => App.store.customFields;

  // One <label class="field">…</label> block per active definition, matching
  // the visual language every other form field in this app already uses.
  function fieldInputHtml(def, currentValue) {
    const val = (currentValue === undefined || currentValue === null) ? def.defaultValue : currentValue;
    const name = `data-cf-input="${U().esc(def.id)}"`;
    // Inline-styled rather than relying on the ".form-field label .req" rule,
    // since this section is embedded inside both ".field"-style Settings
    // forms and ".form-field"-style record modals and must look right in both.
    const reqMark = def.required ? App.i18n.markup(' <span style="color:var(--danger);margin-left:2px">*</span>') : "";
    const help = def.helpText ? App.i18n.html`<div class="form-help">${App.i18n.value(() => (U().esc(def.helpText)))}</div>` : "";
    let inputHtml;
    switch (def.type) {
      case "longtext":
        inputHtml = App.i18n.html`<textarea ${App.i18n.value(() => (name))} rows="3">${App.i18n.value(() => (U().esc(val || "")))}</textarea>`;
        break;
      case "number":
        inputHtml = App.i18n.html`<input type="number" step="any" ${App.i18n.value(() => (name))} value="${App.i18n.value(() => (U().esc(val === "" || val === undefined ? "" : val)))}">`;
        break;
      case "currency":
        inputHtml = App.i18n.html`<input type="number" step="0.01" min="0" ${App.i18n.value(() => (name))} value="${App.i18n.value(() => (U().esc(val === "" || val === undefined ? "" : val)))}">`;
        break;
      case "percentage":
        inputHtml = App.i18n.html`<input type="number" step="0.1" min="0" max="100" ${App.i18n.value(() => (name))} value="${App.i18n.value(() => (U().esc(val === "" || val === undefined ? "" : val)))}">`;
        break;
      case "date":
        inputHtml = App.i18n.html`<input type="date" ${App.i18n.value(() => (name))} value="${App.i18n.value(() => (U().esc(val || "")))}">`;
        break;
      case "boolean":
        inputHtml = App.i18n.html`<label style="display:flex;align-items:center;gap:8px;font-weight:400"><input type="checkbox" ${App.i18n.value(() => (name))} ${App.i18n.value(() => (val ? "checked" : ""))}> <span class="form-help" style="margin:0">${App.i18n.value(() => (val ? App.i18n.t("Yes") : "No"))}</span></label>`;
        break;
      case "select":
        inputHtml = App.i18n.html`<select ${App.i18n.value(() => (name))}><option value="">—</option>${App.i18n.value(() => ((def.options || []).map(o =>
          App.i18n.html`<option value="${App.i18n.value(() => (U().esc(o.id)))}" ${App.i18n.value(() => (val === o.id ? "selected" : ""))}>${App.i18n.value(() => (U().esc(o.label)))}</option>`).join("")))}</select>`;
        break;
      case "multiselect": {
        const chosen = Array.isArray(val) ? val : [];
        inputHtml = App.i18n.html`<div ${App.i18n.value(() => (name))} class="cf-multiselect" style="display:flex;flex-wrap:wrap;gap:10px">${App.i18n.value(() => ((def.options || []).map(o =>
          App.i18n.html`<label style="display:flex;align-items:center;gap:5px;font-weight:400"><input type="checkbox" value="${App.i18n.value(() => (U().esc(o.id)))}" ${App.i18n.value(() => (chosen.indexOf(o.id) !== -1 ? "checked" : ""))}> ${App.i18n.value(() => (U().esc(o.label)))}</label>`).join("") || App.i18n.markup('<span class="form-help">No options defined yet.</span>')))}</div>`;
        break;
      }
      default: // text
        inputHtml = App.i18n.html`<input type="text" ${App.i18n.value(() => (name))} value="${App.i18n.value(() => (U().esc(val || "")))}">`;
    }
    return App.i18n.html`<label class="field"><span>${App.i18n.value(() => (U().esc(def.label)))}${App.i18n.value(() => (reqMark))}</span>${App.i18n.value(() => (inputHtml))}${App.i18n.value(() => (help))}</label>`;
  }

  // Renders the whole "Custom Fields" fieldset for one entity + (optional,
  // for edit forms) an existing record id. Returns "" when the entity has no
  // active custom fields yet, so forms never show an empty section.
  function renderSection(entity, recordId) {
    const defs = CF().activeDefinitionsFor(entity);
    if (!defs.length) return "";
    const rows = defs.map(def => {
      const cur = recordId ? CF().getValue(entity, recordId, def.id) : undefined;
      return fieldInputHtml(def, cur);
    }).join("");
    return App.i18n.html`<div class="form-section-title" style="margin-top:18px">Custom Fields</div><div class="form-grid" data-cf-section="${App.i18n.value(() => (U().esc(entity)))}">${App.i18n.value(() => (rows))}</div>`;
  }

  // Reads every data-cf-input value currently in the DOM under `root` for
  // this entity's active definitions. Returns { fieldId: rawValue }.
  function collectValues(root, entity) {
    const out = {};
    CF().activeDefinitionsFor(entity).forEach(def => {
      if (def.type === "multiselect") {
        const wrap = root.querySelector(`[data-cf-input="${cssEscape(def.id)}"]`);
        if (!wrap) return;
        out[def.id] = Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        return;
      }
      const el = root.querySelector(`[data-cf-input="${cssEscape(def.id)}"]`);
      if (!el) return;
      out[def.id] = def.type === "boolean" ? el.checked : el.value;
    });
    return out;
  }

  // Required-field check, mirroring how every other required field in this
  // app blocks submit (a toast naming what's missing), not a store-level block.
  function findMissingRequired(root, entity) {
    const values = collectValues(root, entity);
    return CF().activeDefinitionsFor(entity)
      .filter(def => def.required)
      .filter(def => {
        const v = values[def.id];
        if (def.type === "boolean") return false; // a checkbox is never "empty"
        if (def.type === "multiselect") return !Array.isArray(v) || v.length === 0;
        return v === undefined || v === null || String(v).trim() === "";
      })
      .map(def => def.label);
  }

  // Minimal CSS.escape polyfill — field ids are our own uid() output
  // (alphanumerics/underscores only) so this only needs to be defensive,
  // not exhaustive.
  function cssEscape(s) {
    return String(s).replace(/[^a-zA-Z0-9_\-]/g, ch => "\\" + ch);
  }

  return { renderSection, collectValues, findMissingRequired };
})();
