import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import carIcon from "../assets/car-icon.png";
import circuitIcon from "../assets/circuit-icon.png";
import engineIcon from "../assets/engine-icon.png";
import { getAccessTokenRole, onAuthChanged } from "../lib/auth.js";

const currentYear = new Date().getFullYear();

const NAV_ITEMS = [
  { path: `/seasons/${currentYear}`, label: "Current Season", icon: "emoji_events" },
  { path: "/seasons", label: "Seasons", end: true, icon: "calendar_month" },
  { path: "/drivers", label: "Drivers", icon: "sports_motorsports" },
  { path: "/circuits", label: "Circuits", iconImg: circuitIcon },
  { path: "/teams", label: "Teams", icon: "groups" },
  { path: "/constructors", label: "Constructors", icon: "factory" },
  { path: "/cars", label: "Cars", iconImg: carIcon },
  { path: "/engines", label: "Engines", iconImg: engineIcon },
];

export default function Sidebar({
  collapsed,
  onToggle,
  isLoggedIn,
  openLoginModal,
  openProfileModal,
  handleLogout,
  profileIdentity,
  profileInitial,
}) {
  const [isAdmin, setIsAdmin] = useState(() => getAccessTokenRole() === "admin");

  useEffect(() => {
    return onAuthChanged(() => {
      setIsAdmin(getAccessTokenRole() === "admin");
    });
  }, []);

  return (
    <aside className={`sidebar${collapsed ? " sidebar--collapsed" : ""}`}>
      <Link to="/" className="sidebar-brand" title="F1 Archive">
        <span className="sidebar-brand-mark">F1</span>
        <span className="sidebar-brand-text">
          <span className="sidebar-brand-name">Data Hub</span>
        </span>
      </Link>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            title={item.label}
            className={({ isActive }) =>
              `sidebar-item${isActive ? " sidebar-item--active" : ""}`
            }
          >
            <span className="sidebar-icon">
              {item.iconImg ? (
                <img src={item.iconImg} alt="" className="sidebar-icon-img" />
              ) : (
                <span className="material-symbols-outlined">{item.icon}</span>
              )}
            </span>
            <span className="sidebar-label">{item.label}</span>
          </NavLink>
        ))}

        <hr className="sidebar-divider" />

        <NavLink
          to="/stats"
          title="Stats"
          className={({ isActive }) =>
            `sidebar-item${isActive ? " sidebar-item--active" : ""}`
          }
        >
          <span className="sidebar-icon">
            <span className="material-symbols-outlined">bar_chart</span>
          </span>
          <span className="sidebar-label">Stats</span>
        </NavLink>

        {isAdmin ? (
          <NavLink
            to="/admin/scheduler"
            title="Scheduler"
            className={({ isActive }) =>
              `sidebar-item${isActive ? " sidebar-item--active" : ""}`
            }
          >
            <span className="sidebar-icon">
              <span className="material-symbols-outlined">schedule</span>
            </span>
            <span className="sidebar-label">Scheduler</span>
          </NavLink>
        ) : null}
      </nav>

      <div className="sidebar-footer">
        {isLoggedIn ? (
          <>
            <button
              type="button"
              className="sidebar-item sidebar-auth-btn"
              onClick={openProfileModal}
              title={profileIdentity?.email || "Profile"}
            >
              <span className="sidebar-icon">
                <span className="sidebar-avatar">{profileInitial}</span>
              </span>
              <span className="sidebar-label">{profileIdentity?.email || "Profile"}</span>
            </button>
            <button
              type="button"
              className="sidebar-item sidebar-auth-btn"
              onClick={handleLogout}
              title="Logout"
            >
              <span className="sidebar-icon">
                <span className="material-symbols-outlined">logout</span>
              </span>
              <span className="sidebar-label">Logout</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            className="sidebar-item sidebar-auth-btn"
            onClick={openLoginModal}
            title="Login"
          >
            <span className="sidebar-icon">
              <span className="material-symbols-outlined">login</span>
            </span>
            <span className="sidebar-label">Login</span>
          </button>
        )}

        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className="material-symbols-outlined">
            {collapsed ? "chevron_right" : "chevron_left"}
          </span>
        </button>
      </div>
    </aside>
  );
}
