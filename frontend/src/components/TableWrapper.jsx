import React from "react";

export default function TableWrapper({ children, className = "" }) {
  const classes = ["data-table-wrapper", className].filter(Boolean).join(" ");
  return <div className={classes}>{children}</div>;
}
