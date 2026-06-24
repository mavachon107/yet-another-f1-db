import React from "react";

export default function DataTable({ children, className = "" }) {
  const classes = ["data-table", className].filter(Boolean).join(" ");
  return <table className={classes}>{children}</table>;
}
