import {useCallback, useRef, useState} from 'react';
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
    setState({identity, value});
  }
  current.current = {identity, value};
  const setValue = useCallback(update => {
    const value = typeof update === 'function' ? update(current.current.value) : update;
    current.current = {identity, value};
    writeNavigation(key, value);
    setState({identity, value});
  }, [key, identity]);
  return [value, setValue];
}
