const API_ROOT = "";

const tableConfigs = {
  seasons: {
    tableId: "table-seasons",
    columns: [
      { key: "year", label: "Year" },
      { key: "competition_id", label: "Competition ID" },
      { key: "rules", label: "Rules" },
      { key: "notes", label: "Notes" },
    ],
  },
  events: {
    tableId: "table-events",
    columns: [
      { key: "championship_short_names", label: "Championship" },
      { key: "event_date", label: "Date" },
      { key: "event_name", label: "Event" },
      { key: "round", label: "Round" },
      { key: "circuit_name", label: "Circuit" },
      { key: "laps", label: "Laps" },
      { key: "distance", label: "Distance" },
      { key: "regulatory_system_abbrev", label: "Reg System" },
    ],
  },
  drivers: {
    tableId: "table-drivers",
    columns: [
      { key: "firstName", label: "First Name" },
      { key: "lastName", label: "Last Name" },
      { key: "driverCode", label: "Driver Code" },
      { key: "dob", label: "DOB" },
      { key: "dod", label: "DOD" },
      { key: "nationality", label: "Country Code" },
      { key: "url", label: "URL" },
    ],
  },
  circuits: {
    tableId: "table-circuits",
    columns: [
      { key: "short_name", label: "Short" },
      { key: "name", label: "Circuit" },
      { key: "city", label: "City" },
      { key: "country", label: "Country" },
      { key: "lat", label: "Lat" },
      { key: "lon", label: "Lon" },
      { key: "alt", label: "Alt" },
      { key: "opened_year", label: "Opened" },
      { key: "url", label: "URL" },
    ],
  },
  cars: {
    tableId: "table-cars",
    columns: [
      { key: "chassis_name", label: "Chassis" },
      { key: "constructor_id", label: "Constructor" },
      { key: "engine_name", label: "Engine" },
      { key: "engine_type", label: "Engine Type" },
      { key: "engine_capacity", label: "Engine Capacity" },
    ],
  },
  engines: {
    tableId: "table-engines",
    columns: [
      { key: "model_number", label: "Model" },
      { key: "constructor_id", label: "Constructor" },
      { key: "layout_id", label: "Layout" },
      { key: "cylinder_count", label: "Cylinders" },
      { key: "displacement_cc", label: "Displacement (cc)" },
      { key: "aspiration_type_id", label: "Aspiration" },
    ],
  },
  constructors: {
    tableId: "table-constructors",
    columns: [
      { key: "name", label: "Constructor" },
      { key: "short_name", label: "Short" },
      { key: "country", label: "Country" },
      { key: "founded_year", label: "Founded" },
      { key: "defunct_year", label: "Defunct" },
    ],
  },
  standings: {
    tableId: "table-standings",
    columns: [
      {
        key: "session",
        label: "Session ID",
        render: (row) => (row.session ? row.session.id : "—"),
      },
      {
        key: "entry",
        label: "Entry ID",
        render: (row) => (row.entry ? row.entry.id : "—"),
      },
      { key: "position", label: "Pos" },
      { key: "points", label: "Points" },
      { key: "time", label: "Time" },
      { key: "gap", label: "Gap" },
      { key: "interval", label: "Interval" },
      { key: "laps", label: "Laps" },
      { key: "time_penalty", label: "Penalty" },
      { key: "grid_position", label: "Grid" },
      { key: "retired_reason", label: "Retired" },
    ],
  },
};

const api = {
  async get(path) {
    const response = await fetch(`${API_ROOT}${path}`);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  },
};

function renderTable(tableId, columns, rows) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
    columns.forEach((col) => {
      const th = document.createElement("th");
      th.textContent = col.label;
      headerRow.appendChild(th);
    });
  thead.appendChild(headerRow);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((col) => {
      const td = document.createElement("td");
      if (col.render) {
        const rendered = col.render(row);
        if (rendered instanceof Node) {
          td.appendChild(rendered);
        } else {
          td.textContent = rendered === undefined || rendered === "" ? "—" : rendered;
        }
      } else {
        const value = row[col.key];
        td.textContent =
          value === null || value === undefined || value === "" ? "—" : value;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.innerHTML = "";
  table.appendChild(thead);
  table.appendChild(tbody);
}

function setCount(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

function bindHeroButtons() {
  document.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.getAttribute("data-jump");
      const el = document.querySelector(target);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

async function loadStaticTables() {
  const [
    drivers,
    cars,
    constructors,
    seasons,
    events,
    circuits,
    regulatorySystems,
    championships,
    results,
  ] =
    await Promise.all([
      api.get("/drivers"),
      api.get("/cars"),
      api.get("/constructors"),
      api.get("/seasons"),
      api.get("/events"),
      api.get("/circuits"),
      api.get("/regulatory-systems"),
      api.get("/championships"),
      api.get("/session-results"),
    ]);

  renderTable(tableConfigs.drivers.tableId, tableConfigs.drivers.columns, drivers);
  renderTable(tableConfigs.cars.tableId, tableConfigs.cars.columns, cars);
  renderTable(
    tableConfigs.constructors.tableId,
    tableConfigs.constructors.columns,
    constructors
  );
  renderTable(tableConfigs.seasons.tableId, tableConfigs.seasons.columns, seasons);
  renderTable(tableConfigs.standings.tableId, tableConfigs.standings.columns, results);

  setCount("count-drivers", drivers.length);
  setCount("count-cars", cars.length);
  setCount("count-seasons", seasons.length);
  setCount("count-events", events.length);

  const seasonSelect = document.getElementById("season-select");
  const sortedSeasons = [...seasons].sort((a, b) => a.year - b.year);
  seasonSelect.innerHTML = [
    `<option value="all">All seasons</option>`,
    ...sortedSeasons.map(
      (season) => `<option value="${season.id}">${season.year}</option>`
    ),
  ].join("");

  const decorateEvents = (items) =>
    items.map((event) => ({
      ...event,
      circuit_name: event.circuit?.name || "—",
      championship_short_names: event.championships?.length
        ? event.championships.map((champ) => champ.short_name).join(", ")
        : "—",
      regulatory_system_abbrev: event.regulatory_system?.abbreviation || "—",
    }));

  const eventModal = document.getElementById("event-modal");
  const closeEventModal = document.getElementById("close-event-modal");
  const cancelEventModal = document.getElementById("cancel-event-modal");
  const eventForm = document.getElementById("event-form");
  const createEventButton = document.getElementById("create-event");
  const createEventModal = document.getElementById("create-event-modal");
  const closeCreateEventModal = document.getElementById("close-create-event-modal");
  const cancelCreateEventModal = document.getElementById("cancel-create-event-modal");
  const createEventForm = document.getElementById("create-event-form");
  let currentSeasonId = null;

  const openEventModal = (event) => {
    if (!eventModal || !eventForm) return;
    eventForm.reset();
    eventForm.event_id.value = event.id;
    eventForm.event_name.value = event.event_name || "";
    eventForm.round.value = event.round ?? "";
    eventForm.event_date.value = event.event_date || "";
    eventForm.laps.value = event.laps ?? "";
    eventForm.distance.value = event.distance || "";
    const circuitSelect = eventForm.querySelector("select[name='circuit_id']");
    const championshipSelect = eventForm.querySelector(
      "select[name='championship_ids']"
    );
    if (circuitSelect) {
      circuitSelect.innerHTML = circuits
        .map(
          (circuit) =>
            `<option value="${circuit.id}">${circuit.name}</option>`
        )
        .join("");
      circuitSelect.value = event.circuit?.id || "";
    }
    if (championshipSelect) {
      const selected = new Set(
        (event.championships || []).map((champ) => String(champ.id))
      );
      championshipSelect.innerHTML = championships
        .map((champ) => {
          const isSelected = selected.has(String(champ.id)) ? " selected" : "";
          return `<option value="${champ.id}"${isSelected}>${champ.short_name}</option>`;
        })
        .join("");
    }
    eventModal.classList.add("active");
  };

  const closeEventModalHandler = () => {
    if (!eventModal) return;
    eventModal.classList.remove("active");
  };

  if (closeEventModal) {
    closeEventModal.addEventListener("click", closeEventModalHandler);
  }

  if (cancelEventModal) {
    cancelEventModal.addEventListener("click", closeEventModalHandler);
  }

  if (eventModal) {
    eventModal.addEventListener("click", (event) => {
      if (event.target === eventModal) {
        closeEventModalHandler();
      }
    });
  }

  const openCreateEventModal = () => {
    if (!createEventModal || !createEventForm) return;
    createEventForm.reset();
    const circuitSelect = createEventForm.querySelector("select[name='circuit_id']");
    const regSelect = createEventForm.querySelector(
      "select[name='regulatory_system_id']"
    );
    if (circuitSelect) {
      circuitSelect.innerHTML = circuits
        .map(
          (circuit) =>
            `<option value="${circuit.id}">${circuit.name}</option>`
        )
        .join("");
    }
    if (regSelect) {
      regSelect.innerHTML = [
        `<option value="">None</option>`,
        ...regulatorySystems.map(
          (reg) => `<option value="${reg.id}">${reg.abbreviation}</option>`
        ),
      ].join("");
    }
    createEventModal.classList.add("active");
  };

  const closeCreateEventModalHandler = () => {
    if (!createEventModal) return;
    createEventModal.classList.remove("active");
  };

  if (createEventButton) {
    createEventButton.addEventListener("click", openCreateEventModal);
  }

  if (closeCreateEventModal) {
    closeCreateEventModal.addEventListener("click", closeCreateEventModalHandler);
  }

  if (cancelCreateEventModal) {
    cancelCreateEventModal.addEventListener("click", closeCreateEventModalHandler);
  }

  if (createEventModal) {
    createEventModal.addEventListener("click", (event) => {
      if (event.target === createEventModal) {
        closeCreateEventModalHandler();
      }
    });
  }

  const eventsColumns = [
    ...tableConfigs.events.columns,
    {
      key: "actions",
      label: "Actions",
      render: (row) => {
        const wrapper = document.createElement("div");
        wrapper.className = "table-actions";
        const button = document.createElement("button");
        button.className = "ghost";
        button.type = "button";
        button.textContent = "Update";
        button.addEventListener("click", () => openEventModal(row));
        wrapper.appendChild(button);
        return wrapper;
      },
    },
  ];

  const renderEventsForSeason = async (seasonId) => {
    currentSeasonId = seasonId || "all";
    const endpoint =
      !seasonId || seasonId === "all"
        ? "/events"
        : `/events/by-season/${seasonId}`;
    const seasonEvents = await api.get(endpoint);
    const decorated = decorateEvents(seasonEvents).sort((a, b) => {
      const dateA = a.event_date ? new Date(a.event_date).getTime() : 0;
      const dateB = b.event_date ? new Date(b.event_date).getTime() : 0;
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      const roundA = a.round ?? 0;
      const roundB = b.round ?? 0;
      return roundA - roundB;
    });
    renderTable(tableConfigs.events.tableId, eventsColumns, decorated);
  };

  renderEventsForSeason(seasonSelect.value);

  seasonSelect.addEventListener("change", (event) => {
    renderEventsForSeason(event.target.value).catch(console.error);
  });

  if (eventForm) {
    eventForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(eventForm);
      const eventId = formData.get("event_id");
      const payload = {
        event_name: formData.get("event_name") || null,
        round: formData.get("round") ? Number(formData.get("round")) : null,
        event_date: formData.get("event_date") || null,
        laps: formData.get("laps") ? Number(formData.get("laps")) : null,
        distance: formData.get("distance") || null,
        circuit_id: formData.get("circuit_id")
          ? Number(formData.get("circuit_id"))
          : null,
      };
      const championshipIds = formData.getAll("championship_ids").map(Number);

      try {
        const response = await fetch(`/events/${eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(`Update failed: ${response.status}`);
        }
        const linkResponse = await fetch(`/events/${eventId}/championships`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ championship_ids: championshipIds }),
        });
        if (!linkResponse.ok) {
          throw new Error(`Championship update failed: ${linkResponse.status}`);
        }
        await renderEventsForSeason(currentSeasonId);
        closeEventModalHandler();
      } catch (error) {
        console.error(error);
        alert("Failed to update event. Check console for details.");
      }
    });
  }

  if (createEventForm) {
    createEventForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(createEventForm);
      if (!currentSeasonId || currentSeasonId === "all") {
        alert("Select a season before creating an event.");
        return;
      }
      const payload = {
        season_id: Number(currentSeasonId),
        event_name: formData.get("event_name") || null,
        round: formData.get("round") ? Number(formData.get("round")) : null,
        event_date: formData.get("event_date"),
        laps: formData.get("laps") ? Number(formData.get("laps")) : null,
        distance: formData.get("distance") || null,
        circuit_id: Number(formData.get("circuit_id")),
        regulatory_system_id: formData.get("regulatory_system_id")
          ? Number(formData.get("regulatory_system_id"))
          : null,
      };

      try {
        const response = await fetch("/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(`Create failed: ${response.status}`);
        }
        await renderEventsForSeason(currentSeasonId);
        closeCreateEventModalHandler();
      } catch (error) {
        console.error(error);
        alert("Failed to create event. Check console for details.");
      }
    });
  }

  const circuitsPageSize = 25;
  const circuitsPagination = document.getElementById("circuits-pagination");
  const renderCircuitsPage = (page) => {
    const start = (page - 1) * circuitsPageSize;
    const pageItems = circuits.slice(start, start + circuitsPageSize);
    renderTable(tableConfigs.circuits.tableId, tableConfigs.circuits.columns, pageItems);

    if (!circuitsPagination) return;
    const totalPages = Math.max(1, Math.ceil(circuits.length / circuitsPageSize));
    circuitsPagination.innerHTML = "";
    for (let i = 1; i <= totalPages; i += 1) {
      const button = document.createElement("button");
      button.textContent = i;
      if (i === page) {
        button.classList.add("active");
      }
      button.addEventListener("click", () => renderCircuitsPage(i));
      circuitsPagination.appendChild(button);
    }
  };
  renderCircuitsPage(1);

  const createCircuitButton = document.getElementById("create-circuit");
  const circuitModal = document.getElementById("circuit-modal");
  const closeCircuitModal = document.getElementById("close-circuit-modal");
  const cancelCircuitModal = document.getElementById("cancel-circuit-modal");
  const circuitForm = document.getElementById("circuit-form");

  const openCircuitModal = () => {
    if (!circuitModal) return;
    circuitModal.classList.add("active");
  };

  const closeCircuitModalHandler = () => {
    if (!circuitModal) return;
    circuitModal.classList.remove("active");
    if (circuitForm) circuitForm.reset();
  };

  if (createCircuitButton) {
    createCircuitButton.addEventListener("click", openCircuitModal);
  }

  if (closeCircuitModal) {
    closeCircuitModal.addEventListener("click", closeCircuitModalHandler);
  }

  if (cancelCircuitModal) {
    cancelCircuitModal.addEventListener("click", closeCircuitModalHandler);
  }

  if (circuitModal) {
    circuitModal.addEventListener("click", (event) => {
      if (event.target === circuitModal) {
        closeCircuitModalHandler();
      }
    });
  }

  if (circuitForm) {
    circuitForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(circuitForm);
      const payload = {
        short_name: formData.get("short_name"),
        name: formData.get("name"),
        city: formData.get("city") || null,
        country: formData.get("country") || null,
        lat: formData.get("lat") ? Number(formData.get("lat")) : null,
        lon: formData.get("lon") ? Number(formData.get("lon")) : null,
        alt: formData.get("alt") ? Number(formData.get("alt")) : null,
        url: formData.get("url") || null,
        opened_year: formData.get("opened_year")
          ? Number(formData.get("opened_year"))
          : null,
        notes: formData.get("notes") || null,
      };

      try {
        const response = await fetch("/circuits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(`Create failed: ${response.status}`);
        }
        const updatedCircuits = await api.get("/circuits");
        circuits.splice(0, circuits.length, ...updatedCircuits);
        renderCircuitsPage(1);
        closeCircuitModalHandler();
      } catch (error) {
        console.error(error);
        alert("Failed to create circuit. Check console for details.");
      }
    });
  }
}

bindHeroButtons();
loadStaticTables().catch((error) => {
  console.error(error);
});
