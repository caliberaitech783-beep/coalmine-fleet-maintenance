import {startTransition, useCallback, useRef, useState} from 'react';
import {navigationScope, readNavigation, writeNavigation} from './navigation-state.mjs';
export {configureNavigation, resetNavigation} from './navigation-state.mjs';

// Only navigation selections use this hook; forms and fetched records stay transient.
// sessionStorage survives reload and keeps independent browser tabs independent.
export function useNavigationState(key, initial) {
  const identity = `${navigationScope()}:${key}`;
  const [state, setState] = useState(() => ({identity, value: readNavigation(key, initial)}));
  const current = useRef(state);
  let value = state.value;
  if (state.identity !== identity) {
    value = readNavigation(key, initial);
    // Page and tab changes can mount very large reports. A transition keeps
    // the current controls responsive while React prepares the next screen.
    startTransition(() => setState({identity, value}));
  }
  current.current = {identity, value};
  const setValue = useCallback(update => {
    const previous = current.current.value;
    const value = typeof update === 'function' ? update(previous) : update;
    // Clicking an already selected page or tab must not rebuild its large
    // report tree or rewrite browser storage.
    if (Object.is(value, previous)) return;
    current.current = {identity, value};
    writeNavigation(key, value);
    setState({identity, value});
  }, [key, identity]);
  return [value, setValue];
}
