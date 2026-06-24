import { useEffect, useState } from "react";

import { isAuthenticated, onAuthChanged } from "./auth.js";

export default function useAuthStatus() {
  const [canEdit, setCanEdit] = useState(isAuthenticated());

  useEffect(() => {
    return onAuthChanged(() => {
      setCanEdit(isAuthenticated());
    });
  }, []);

  return canEdit;
}
