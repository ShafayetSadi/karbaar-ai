import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/** Meaningful panels use router history, including Back/Forward and direct-entry fallback. */
export function useUrlPanel(parameter: string, token = 'open') {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const open = params.get(parameter) === token;
  const setOpen = useCallback(
    (value: boolean) => {
      if (value === open) return;
      if (!value && location.state?.panelEntry === parameter) {
        void navigate(-1);
        return;
      }
      const next = new URLSearchParams(params);
      if (value) next.set(parameter, token);
      else next.delete(parameter);
      setParams(next, {
        replace: !value,
        state: value ? { ...location.state, panelEntry: parameter } : location.state,
      });
    },
    [params, setParams, parameter, token, open, location.state, navigate],
  );
  return [open, setOpen] as const;
}
