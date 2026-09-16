import React, {useState} from "react";
import {displaySiteSelection, userSiteSelection} from "../region-scope.mjs";
import "./user-site-fields.css";

export default function UserSiteFields({record = {}, siteOptions = []}) {
  const [selected, setSelected] = useState(() => userSiteSelection(record));
  const options = displaySiteSelection([...siteOptions, ...userSiteSelection(record)]);
  const allSelected = options.length > 0 && options.every((site) => selected.includes(site));
  return <fieldset className="account-role-field user-site-field full">
    <legend>Location *</legend>
    <p>Select one or more sites. This user will only have access to data for the selected sites.</p>
    <input type="hidden" name="site" value={selected.join(" | ")} />
    <div className="user-site-selection-header">
      <label className={allSelected ? "selected" : ""}>
        <input type="checkbox" checked={allSelected} disabled={!options.length}
          ref={(input) => {if (input) input.indeterminate = selected.length > 0 && !allSelected;}}
          onChange={(event) => setSelected(event.target.checked ? options : [])} />
        <span><b>All sites</b><small>Select every listed site</small></span>
      </label>
      <span aria-live="polite">{selected.length} of {options.length} sites selected</span>
    </div>
    <div className="user-site-options">
      {options.map((site) => <label key={site} className={selected.includes(site) ? "selected" : ""}>
        <input type="checkbox" checked={selected.includes(site)}
          onChange={(event) => setSelected((current) => event.target.checked ? [...current, site] : current.filter((value) => value !== site))} />
        <span>{site}</span>
      </label>)}
    </div>
    {!options.length && <p>No sites are available. Add a site before assigning this user.</p>}
  </fieldset>;
}
